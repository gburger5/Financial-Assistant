package test

import (
	"path/filepath"
	"testing"

	"github.com/gruntwork-io/terratest/modules/terraform"
	"github.com/stretchr/testify/assert"
)

// terraformDir is relative to this test file
const terraformDir = ".."

// defaultVars represents a standard HTTP-only deployment with defaults
func defaultVars() map[string]interface{} {
	return map[string]interface{}{
		"aws_region":  "us-east-1",
		"domain_name": "",
	}
}

// planOnly returns TerraformOptions configured for plan-only runs (no apply).
// Each test gets a unique plan file in its own temp dir to avoid parallel conflicts.
func planOnly(t *testing.T, vars map[string]interface{}) *terraform.Options {
	return terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		TerraformDir: terraformDir,
		Vars:         vars,
		NoColor:      true,
		PlanFilePath: filepath.Join(t.TempDir(), "tfplan"),
	})
}

// ── ALB ───────────────────────────────────────────────────────────────────────

func TestALBIdleTimeout(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	alb, exists := plan.ResourcePlannedValuesMap["aws_lb.agents"]
	assert.True(t, exists, "aws_lb.agents should be in plan")

	idleTimeout := alb.AttributeValues["idle_timeout"]
	assert.EqualValues(t, 300, idleTimeout,
		"ALB idle_timeout must be 300s to support long AI agent calls")
}

func TestALBIsPublic(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	alb, exists := plan.ResourcePlannedValuesMap["aws_lb.agents"]
	if !assert.True(t, exists, "aws_lb.agents should be in plan") {
		return
	}
	// internal=false means internet-facing; null also means not internal (default)
	assert.NotEqual(t, true, alb.AttributeValues["internal"],
		"ALB must be internet-facing (internal must not be true)")
}

func TestALBHTTPListenerForwardsWhenNoDomain(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	listener, exists := plan.ResourcePlannedValuesMap["aws_lb_listener.http"]
	assert.True(t, exists, "HTTP listener must always be created")

	actions := listener.AttributeValues["default_action"].([]interface{})
	assert.Equal(t, "forward", actions[0].(map[string]interface{})["type"],
		"HTTP listener should forward (not redirect) when no domain is set")
}

func TestHTTPSResourcesAbsentWithoutDomain(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	_, httpsListenerExists := plan.ResourcePlannedValuesMap["aws_lb_listener.https[0]"]
	_, acmCertExists := plan.ResourcePlannedValuesMap["aws_acm_certificate.agents[0]"]
	_, r53RecordExists := plan.ResourcePlannedValuesMap["aws_route53_record.agents[0]"]

	assert.False(t, httpsListenerExists, "HTTPS listener should NOT be created without domain_name")
	assert.False(t, acmCertExists, "ACM cert should NOT be created without domain_name")
	assert.False(t, r53RecordExists, "Route53 record should NOT be created without domain_name")
}

func TestHTTPSResourcesPresentWithDomain(t *testing.T) {
	t.Parallel()

	vars := defaultVars()
	vars["domain_name"] = "agents.example.com"
	vars["route53_zone_id"] = "Z1234567890ABC"

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, vars))

	_, httpsListenerExists := plan.ResourcePlannedValuesMap["aws_lb_listener.https[0]"]
	_, acmCertExists := plan.ResourcePlannedValuesMap["aws_acm_certificate.agents[0]"]
	_, r53RecordExists := plan.ResourcePlannedValuesMap["aws_route53_record.agents[0]"]

	assert.True(t, httpsListenerExists, "HTTPS listener must be created when domain_name is set")
	assert.True(t, acmCertExists, "ACM cert must be created when domain_name is set")
	assert.True(t, r53RecordExists, "Route53 alias record must be created when domain_name is set")
}

func TestHTTPListenerRedirectsWithDomain(t *testing.T) {
	t.Parallel()

	vars := defaultVars()
	vars["domain_name"] = "agents.example.com"
	vars["route53_zone_id"] = "Z1234567890ABC"

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, vars))

	listener := plan.ResourcePlannedValuesMap["aws_lb_listener.http"]
	actions := listener.AttributeValues["default_action"].([]interface{})
	assert.Equal(t, "redirect", actions[0].(map[string]interface{})["type"],
		"HTTP listener should redirect to HTTPS when domain_name is set")
}

// ── Target Group ──────────────────────────────────────────────────────────────

func TestTargetGroupHealthCheck(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	tg, exists := plan.ResourcePlannedValuesMap["aws_lb_target_group.agents"]
	assert.True(t, exists, "Target group must exist")

	hc := tg.AttributeValues["health_check"].([]interface{})[0].(map[string]interface{})
	assert.Equal(t, "/health", hc["path"], "Health check path must be /health")
	assert.Equal(t, "200", hc["matcher"], "Health check must expect HTTP 200")
	assert.EqualValues(t, 30, hc["interval"], "Health check interval must be 30s")
}

func TestTargetGroupPortAndProtocol(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	tg := plan.ResourcePlannedValuesMap["aws_lb_target_group.agents"]
	assert.EqualValues(t, 8080, tg.AttributeValues["port"])
	assert.Equal(t, "HTTP", tg.AttributeValues["protocol"])
	assert.Equal(t, "ip", tg.AttributeValues["target_type"],
		"Target type must be ip for Fargate awsvpc networking")
}

// ── ECS ───────────────────────────────────────────────────────────────────────

func TestECSClusterInsightsEnabled(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	cluster, exists := plan.ResourcePlannedValuesMap["aws_ecs_cluster.agents"]
	assert.True(t, exists, "ECS cluster must exist")

	settings := cluster.AttributeValues["setting"].([]interface{})
	found := false
	for _, s := range settings {
		setting := s.(map[string]interface{})
		if setting["name"] == "containerInsights" && setting["value"] == "enabled" {
			found = true
		}
	}
	assert.True(t, found, "Container Insights must be enabled on ECS cluster")
}

func TestECSTaskDefinitionCPUAndMemory(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	td, exists := plan.ResourcePlannedValuesMap["aws_ecs_task_definition.agents"]
	assert.True(t, exists, "ECS task definition must exist")

	assert.Equal(t, "512", td.AttributeValues["cpu"], "Default CPU should be 512 units")
	assert.Equal(t, "1024", td.AttributeValues["memory"], "Default memory should be 1024 MiB")
}

func TestECSTaskDefinitionIsFargate(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	td := plan.ResourcePlannedValuesMap["aws_ecs_task_definition.agents"]
	requires := td.AttributeValues["requires_compatibilities"].([]interface{})
	assert.Contains(t, requires, "FARGATE")
	assert.Equal(t, "awsvpc", td.AttributeValues["network_mode"])
}

func TestECSServiceDesiredCount(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	svc, exists := plan.ResourcePlannedValuesMap["aws_ecs_service.agents"]
	assert.True(t, exists, "ECS service must exist")
	assert.EqualValues(t, 1, svc.AttributeValues["desired_count"],
		"Default desired count should be 1")
}

func TestECSServiceAssignsPublicIP(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	svc := plan.ResourcePlannedValuesMap["aws_ecs_service.agents"]
	netConfig := svc.AttributeValues["network_configuration"].([]interface{})[0].(map[string]interface{})
	assert.Equal(t, true, netConfig["assign_public_ip"],
		"Tasks must have public IPs to reach Anthropic API without NAT Gateway")
}

func TestECSServiceLaunchType(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	svc := plan.ResourcePlannedValuesMap["aws_ecs_service.agents"]
	assert.Equal(t, "FARGATE", svc.AttributeValues["launch_type"])
}

// ── CloudWatch ────────────────────────────────────────────────────────────────

func TestCloudWatchLogGroupRetention(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	lg, exists := plan.ResourcePlannedValuesMap["aws_cloudwatch_log_group.agents"]
	assert.True(t, exists, "CloudWatch log group must exist")
	assert.EqualValues(t, 30, lg.AttributeValues["retention_in_days"],
		"Log retention must be 30 days")
	assert.Equal(t, "/ecs/financial-assistant-agents", lg.AttributeValues["name"])
}

// ── ECR ───────────────────────────────────────────────────────────────────────

func TestECRScanOnPush(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	repo, exists := plan.ResourcePlannedValuesMap["aws_ecr_repository.agents"]
	assert.True(t, exists, "ECR repository must exist")

	scanConfig := repo.AttributeValues["image_scanning_configuration"].([]interface{})[0].(map[string]interface{})
	assert.Equal(t, true, scanConfig["scan_on_push"], "ECR must scan images on push")
}

// ── Security Groups ───────────────────────────────────────────────────────────

func TestALBSecurityGroupAllowsHTTP(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	rule, exists := plan.ResourcePlannedValuesMap["aws_vpc_security_group_ingress_rule.alb_http"]
	assert.True(t, exists, "ALB HTTP ingress rule must exist")
	assert.Equal(t, "0.0.0.0/0", rule.AttributeValues["cidr_ipv4"])
	assert.EqualValues(t, 80, rule.AttributeValues["from_port"])
	assert.EqualValues(t, 80, rule.AttributeValues["to_port"])
}

func TestECSSecurityGroupAllowsOnlyContainerPort(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	rule, exists := plan.ResourcePlannedValuesMap["aws_vpc_security_group_ingress_rule.ecs_from_alb"]
	assert.True(t, exists, "ECS ingress rule must exist")
	assert.EqualValues(t, 8080, rule.AttributeValues["from_port"])
	assert.EqualValues(t, 8080, rule.AttributeValues["to_port"])
	// Must be locked to the ALB SG, not open to the world
	assert.Nil(t, rule.AttributeValues["cidr_ipv4"],
		"ECS tasks must only accept traffic from ALB security group, not 0.0.0.0/0")
}

// ── DynamoDB ──────────────────────────────────────────────────────────────────

func TestDynamoDBTablesExist(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	tables := []string{
		"aws_dynamodb_table.users",
		"aws_dynamodb_table.proposals",
		"aws_dynamodb_table.debts",
		"aws_dynamodb_table.investments",
		"aws_dynamodb_table.goals",
	}
	for _, table := range tables {
		_, exists := plan.ResourcePlannedValuesMap[table]
		assert.True(t, exists, "%s must be in plan", table)
	}
}

func TestDynamoDBUsersHashKey(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	users := plan.ResourcePlannedValuesMap["aws_dynamodb_table.users"]
	assert.Equal(t, "id", users.AttributeValues["hash_key"],
		"users table partition key must be 'id'")
}

func TestDynamoDBDebtsCompositeKey(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	debts := plan.ResourcePlannedValuesMap["aws_dynamodb_table.debts"]
	assert.Equal(t, "userId", debts.AttributeValues["hash_key"])
	assert.Equal(t, "debtId", debts.AttributeValues["range_key"])
}

func TestDynamoDBInvestmentsCompositeKey(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	investments := plan.ResourcePlannedValuesMap["aws_dynamodb_table.investments"]
	assert.Equal(t, "userId", investments.AttributeValues["hash_key"])
	assert.Equal(t, "accountId", investments.AttributeValues["range_key"])
}

func TestDynamoDBBillingModeIsPayPerRequest(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	for _, name := range []string{"users", "proposals", "debts", "investments", "goals"} {
		table := plan.ResourcePlannedValuesMap["aws_dynamodb_table."+name]
		assert.Equal(t, "PAY_PER_REQUEST", table.AttributeValues["billing_mode"],
			"%s table must use PAY_PER_REQUEST billing", name)
	}
}

// ── IAM ───────────────────────────────────────────────────────────────────────

func TestIAMRolesHaveCorrectServicePrincipal(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	for _, roleName := range []string{"aws_iam_role.ecs_execution", "aws_iam_role.ecs_task"} {
		role, exists := plan.ResourcePlannedValuesMap[roleName]
		assert.True(t, exists, "%s must exist", roleName)
		assert.Contains(t, role.AttributeValues["assume_role_policy"].(string),
			"ecs-tasks.amazonaws.com",
			"%s trust policy must allow ecs-tasks.amazonaws.com", roleName)
	}
}

// ── Secrets Manager ───────────────────────────────────────────────────────────

func TestSecretsManagerSecretName(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	secret, exists := plan.ResourcePlannedValuesMap["aws_secretsmanager_secret.anthropic_api_key"]
	assert.True(t, exists, "Secrets Manager secret must exist")
	assert.Equal(t, "financial-assistant/anthropic-api-key", secret.AttributeValues["name"])
	assert.EqualValues(t, 7, secret.AttributeValues["recovery_window_in_days"])
}

// ── Outputs ───────────────────────────────────────────────────────────────────

func TestOutputsAreDefined(t *testing.T) {
	t.Parallel()

	plan := terraform.InitAndPlanAndShowWithStruct(t, planOnly(t, defaultVars()))

	outputs := plan.RawPlan.PlannedValues.Outputs
	for _, name := range []string{"alb_dns_name", "ecr_repository_url", "ecs_cluster_name", "ecs_service_name", "agents_url"} {
		_, exists := outputs[name]
		assert.True(t, exists, "output '%s' must be defined", name)
	}
}
