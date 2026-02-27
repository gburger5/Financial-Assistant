resource "aws_dynamodb_table" "users" {
  name         = var.users_table
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name            = "email-index"
    hash_key        = "email"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "proposals" {
  name         = var.proposals_table
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "proposalId"

  attribute {
    name = "proposalId"
    type = "S"
  }
}

resource "aws_dynamodb_table" "debts" {
  name         = var.debts_table
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "debtId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "debtId"
    type = "S"
  }
}

resource "aws_dynamodb_table" "investments" {
  name         = var.investments_table
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "accountId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "accountId"
    type = "S"
  }
}

resource "aws_dynamodb_table" "goals" {
  name         = var.goals_table
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }
}

resource "aws_dynamodb_table" "auth_tokens" {
  name         = var.auth_tokens_table
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tokenId"

  attribute {
    name = "tokenId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}
