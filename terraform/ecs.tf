# ── ECS Cluster ────────────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "agents" {
  name = var.app_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "agents" {
  cluster_name       = aws_ecs_cluster.agents.name
  capacity_providers = ["FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

# ── CloudWatch log group ───────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "agents" {
  name              = "/ecs/${var.app_name}"
  retention_in_days = 30
}

# ── Task definition ────────────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "agents" {
  family                   = var.app_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = var.app_name
      image     = "${aws_ecr_repository.agents.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "AWS_DEFAULT_REGION", value = var.aws_region },
        { name = "USERS_TABLE", value = var.users_table },
        { name = "GOALS_TABLE", value = var.goals_table },
        { name = "PROPOSALS_TABLE", value = var.proposals_table },
        { name = "DEBTS_TABLE", value = var.debts_table },
        { name = "INVESTMENTS_TABLE", value = var.investments_table },
      ]

      secrets = [
        {
          name      = "ANTHROPIC_API_KEY"
          valueFrom = "${aws_secretsmanager_secret.anthropic_api_key.arn}:ANTHROPIC_API_KEY::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.agents.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:${var.container_port}/health')\" || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 10
      }
    }
  ])
}

# ── Fargate service ────────────────────────────────────────────────────────────
resource "aws_ecs_service" "agents" {
  name                   = var.app_name
  cluster                = aws_ecs_cluster.agents.id
  task_definition        = aws_ecs_task_definition.agents.arn
  desired_count          = var.desired_count
  launch_type            = "FARGATE"
  enable_execute_command = true

  network_configuration {
    subnets          = data.aws_subnets.public.ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.agents.arn
    container_name   = var.app_name
    container_port   = var.container_port
  }

  depends_on = [
    aws_lb_listener.http,
    aws_iam_role_policy_attachment.ecs_execution_managed,
  ]

  lifecycle {
    # Allow CI/CD to update the task definition without Terraform reverting it
    ignore_changes = [task_definition]
  }
}
