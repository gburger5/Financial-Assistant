/**
 * @module setup-tables
 * @description Creates all DynamoDB tables and GSIs required by the application.
 * Exported as a callable function for use in test globalSetup, and also runnable
 * directly as a script: npx tsx src/scripts/setup-tables.ts
 */

import "dotenv/config";
import {
  DynamoDBClient,
  CreateTableCommand,
  ResourceInUseException,
} from "@aws-sdk/client-dynamodb";

/**
 * Creates a single DynamoDB table, ignoring "already exists" errors.
 *
 * @param {DynamoDBClient} client - The DynamoDB client to use.
 * @param {string} name - Human-readable table name for logging.
 * @param {object} params - CreateTableCommand input.
 */
async function createTable(client: DynamoDBClient, name: string, params: object) {
  try {
    await client.send(new CreateTableCommand(params as never));
    console.log(`✓ Created table: ${name}`);
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      console.log(`  Table already exists: ${name}`);
    } else {
      throw error;
    }
  }
}

/**
 * Creates all application tables and GSIs in DynamoDB.
 * Safe to call repeatedly — existing tables are silently skipped.
 *
 * @param {string} [endpoint] - Optional DynamoDB endpoint override.
 *   Defaults to DYNAMODB_ENDPOINT env var.
 */
export async function setupTables(endpoint?: string): Promise<void> {
  const resolvedEndpoint = endpoint ?? process.env.DYNAMODB_ENDPOINT;

  const client = new DynamoDBClient(
    resolvedEndpoint
      ? {
          endpoint: resolvedEndpoint,
          region: "us-east-1",
          credentials: { accessKeyId: "local", secretAccessKey: "local" },
        }
      : {}
  );

  await createTable(client, "Users", {
    TableName: "Users",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "id", AttributeType: "S" },
      { AttributeName: "email", AttributeType: "S" },
      { AttributeName: "emailVerificationToken", AttributeType: "S" },
      { AttributeName: "passwordResetToken", AttributeType: "S" },
    ],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
      {
        IndexName: "email-index",
        KeySchema: [{ AttributeName: "email", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "EmailVerificationTokenIndex",
        KeySchema: [{ AttributeName: "emailVerificationToken", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "passwordResetToken-index",
        KeySchema: [{ AttributeName: "passwordResetToken", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });

  await createTable(client, "Budgets", {
    TableName: "Budgets",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "budgetId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "userId", KeyType: "HASH" },
      { AttributeName: "budgetId", KeyType: "RANGE" },
    ],
  });

  await createTable(client, "auth_tokens", {
    TableName: "auth_tokens",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "tokenId", AttributeType: "S" },
      { AttributeName: "userId", AttributeType: "S" },
    ],
    KeySchema: [{ AttributeName: "tokenId", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
      {
        IndexName: "userId-index",
        KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });

  await createTable(client, "PlaidItems", {
    TableName: "PlaidItems",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "itemId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "userId", KeyType: "HASH" },
      { AttributeName: "itemId", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "itemId-index",
        KeySchema: [{ AttributeName: "itemId", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });

  await createTable(client, "Accounts", {
    TableName: "Accounts",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "plaidAccountId", AttributeType: "S" },
      { AttributeName: "itemId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "userId", KeyType: "HASH" },
      { AttributeName: "plaidAccountId", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "itemId-index",
        KeySchema: [
          { AttributeName: "itemId", KeyType: "HASH" },
          { AttributeName: "plaidAccountId", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "plaidAccountId-index",
        KeySchema: [{ AttributeName: "plaidAccountId", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });

  await createTable(client, "Transactions", {
    TableName: "Transactions",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "sortKey", AttributeType: "S" },
      { AttributeName: "plaidTransactionId", AttributeType: "S" },
      { AttributeName: "plaidAccountId", AttributeType: "S" },
      { AttributeName: "date", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "userId", KeyType: "HASH" },
      { AttributeName: "sortKey", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "plaidTransactionId-index",
        KeySchema: [{ AttributeName: "plaidTransactionId", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "accountId-date-index",
        KeySchema: [
          { AttributeName: "plaidAccountId", KeyType: "HASH" },
          { AttributeName: "date", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });

  await createTable(client, "InvestmentTransactions", {
    TableName: "InvestmentTransactions",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "dateTransactionId", AttributeType: "S" },
      { AttributeName: "plaidInvestmentTransactionId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "userId", KeyType: "HASH" },
      { AttributeName: "dateTransactionId", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "plaidInvestmentTransactionId-index",
        KeySchema: [
          { AttributeName: "plaidInvestmentTransactionId", KeyType: "HASH" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });

  await createTable(client, "Holdings", {
    TableName: "Holdings",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "snapshotDateAccountSecurity", AttributeType: "S" },
      { AttributeName: "plaidAccountId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "userId", KeyType: "HASH" },
      { AttributeName: "snapshotDateAccountSecurity", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "plaidAccountId-index",
        KeySchema: [{ AttributeName: "plaidAccountId", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });

  await createTable(client, "Liabilities", {
    TableName: "Liabilities",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "plaidAccountId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "userId", KeyType: "HASH" },
      { AttributeName: "plaidAccountId", KeyType: "RANGE" },
    ],
  });

  await createTable(client, "Proposals", {
    TableName: "Proposals",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "proposalId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "userId", KeyType: "HASH" },
      { AttributeName: "proposalId", KeyType: "RANGE" },
    ],
  });

  console.log("Done.");
}

// Run directly as a script: npx tsx src/scripts/setup-tables.ts
const isDirectRun = process.argv[1]?.endsWith('setup-tables.ts');
if (isDirectRun) {
  setupTables().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
