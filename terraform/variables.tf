variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (e.g. production, staging)"
  type        = string
  default     = "production"
}

variable "app_name" {
  description = "Base name used for resource naming"
  type        = string
  default     = "financial-assistant-agents"
}

# ECS task sizing
variable "task_cpu" {
  description = "CPU units for ECS task (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Memory (MiB) for ECS task"
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Number of ECS task replicas to run"
  type        = number
  default     = 1
}

variable "container_port" {
  description = "Port exposed by the container"
  type        = number
  default     = 8080
}

# DynamoDB table names
variable "users_table" {
  description = "DynamoDB table name for users"
  type        = string
  default     = "users"
}

variable "goals_table" {
  description = "DynamoDB table name for goals"
  type        = string
  default     = "goals"
}

variable "proposals_table" {
  description = "DynamoDB table name for proposals"
  type        = string
  default     = "proposals"
}

variable "debts_table" {
  description = "DynamoDB table name for debts"
  type        = string
  default     = "debts"
}

variable "investments_table" {
  description = "DynamoDB table name for investments"
  type        = string
  default     = "investments"
}

# Frontend
variable "frontend_bucket_name" {
  description = "S3 bucket name for the React frontend (must be globally unique)"
  type        = string
  default     = "financial-assistant-frontend"
}

variable "cloudfront_price_class" {
  description = "CloudFront price class (PriceClass_100 = US/EU only, cheapest)"
  type        = string
  default     = "PriceClass_100"
}

# Lambda / API
variable "lambda_function_name" {
  description = "Name of the Lambda function for the API"
  type        = string
  default     = "financial-assistant-api"
}

variable "jwt_secret_ssm_path" {
  description = "SSM Parameter Store path for the JWT secret"
  type        = string
  default     = "/myapp/jwt-secret"
}

variable "frontend_url_ssm_path" {
  description = "SSM Parameter Store path for the frontend URL"
  type        = string
  default     = "/myapp/frontend-url"
}

# Optional HTTPS / custom domain (leave empty to deploy HTTP only)
variable "domain_name" {
  description = "Custom domain for the ALB (e.g. agents.example.com). Leave empty to use HTTP only."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID. Required when domain_name is set."
  type        = string
  default     = ""
}
