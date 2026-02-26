# ── Placeholder zip — replaced by CI/CD on first push ─────────────────────────
data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/placeholder.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 503, body: JSON.stringify({ message: 'Deploying...' }) })"
    filename = "lambda.js"
  }
}

# ── IAM role ───────────────────────────────────────────────────────────────────
resource "aws_iam_role" "lambda" {
  name = "financial-assistant-api-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "dynamodb-access"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:Query",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
      ]
      Resource = [
        aws_dynamodb_table.users.arn,
        "${aws_dynamodb_table.users.arn}/index/email-index",
        aws_dynamodb_table.auth_tokens.arn,
      ]
    }]
  })
}

resource "aws_iam_role_policy" "lambda_ssm" {
  name = "ssm-access"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["ssm:GetParameter"]
      Resource = [
        "arn:aws:ssm:${var.aws_region}:*:parameter${var.jwt_secret_ssm_path}",
        "arn:aws:ssm:${var.aws_region}:*:parameter${var.frontend_url_ssm_path}",
      ]
    }]
  })
}

# ── SSM parameters (must exist before terraform apply) ────────────────────────
data "aws_ssm_parameter" "jwt_secret" {
  name            = var.jwt_secret_ssm_path
  with_decryption = true
}

data "aws_ssm_parameter" "frontend_url" {
  name = var.frontend_url_ssm_path
}

# ── Lambda function ────────────────────────────────────────────────────────────
resource "aws_lambda_function" "api" {
  function_name    = var.lambda_function_name
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs20.x"
  handler          = "lambda.handler"
  timeout          = 29
  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      NODE_ENV     = "production"
      JWT_SECRET   = data.aws_ssm_parameter.jwt_secret.value
      FRONTEND_URL = data.aws_ssm_parameter.frontend_url.value
    }
  }

  # CI/CD owns all code updates — Terraform only manages config
  lifecycle {
    ignore_changes = [filename, source_code_hash, handler]
  }
}

# ── API Gateway HTTP API ───────────────────────────────────────────────────────
resource "aws_apigatewayv2_api" "api" {
  name          = var.lambda_function_name
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["https://${aws_cloudfront_distribution.frontend.domain_name}"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "api" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

# ── Allow API Gateway to invoke Lambda ────────────────────────────────────────
resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
