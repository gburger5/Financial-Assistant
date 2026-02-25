# Secret shell — value is set out-of-band via CLI or console:
#   aws secretsmanager create-secret \
#     --name financial-assistant/anthropic-api-key \
#     --secret-string '{"ANTHROPIC_API_KEY":"sk-ant-..."}'
resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name                    = "financial-assistant/anthropic-api-key"
  description             = "Anthropic API key for the AI agents service"
  recovery_window_in_days = 7
}
