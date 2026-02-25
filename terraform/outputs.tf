output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.agents.dns_name
}

output "ecr_repository_url" {
  description = "Full ECR repository URL (use as IMAGE_URI in CI/CD)"
  value       = aws_ecr_repository.agents.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.agents.name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.agents.name
}

output "agents_url" {
  description = "Base URL to reach the agents API"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.agents.dns_name}"
}

output "api_gateway_url" {
  description = "HTTP API Gateway invoke URL — set this as VITE_API_URL in the frontend build"
  value       = aws_apigatewayv2_stage.api.invoke_url
}

output "lambda_function_name" {
  description = "Lambda function name (used by CI/CD for code updates)"
  value       = aws_lambda_function.api.function_name
}

output "frontend_bucket_name" {
  description = "S3 bucket name for the React frontend"
  value       = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (needed for cache invalidation in CI/CD)"
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name for the frontend"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

