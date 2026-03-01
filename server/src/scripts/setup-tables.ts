/** To run this script: npx tsx src/scripts/setup-tables.ts 2>&1 */

import "dotenv/config";
import {
  DynamoDBClient,
  CreateTableCommand,
  ResourceInUseException,
} from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient(
  process.env.DYNAMODB_ENDPOINT
    ? {
        endpoint: process.env.DYNAMODB_ENDPOINT,
        region: process.env.AWS_REGION ?? "us-east-1",
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }
    : {}
);

async function createTable(name: string, params: object) {
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

async function main() {
  await createTable("Users", {
    TableName: "Users",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "id", AttributeType: "S" },
      { AttributeName: "email", AttributeType: "S" },
    ],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
      {
        IndexName: "email-index",
        KeySchema: [{ AttributeName: "email", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });

  await createTable("Budgets", {
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

  await createTable("auth_tokens", {
    TableName: "auth_tokens",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "tokenId", AttributeType: "S" },
    ],
    KeySchema: [{ AttributeName: "tokenId", KeyType: "HASH" }],
  });

  await createTable("PlaidItems", {
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

  await createTable("Accounts", {
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

  await createTable("Transactions", {
    TableName: "Transactions",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "dateTransactionId", AttributeType: "S" },
      { AttributeName: "plaidTransactionId", AttributeType: "S" },
      { AttributeName: "plaidAccountId", AttributeType: "S" },
      { AttributeName: "date", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "userId", KeyType: "HASH" },
      { AttributeName: "dateTransactionId", KeyType: "RANGE" },
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

  await createTable("InvestmentTransactions", {
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

  await createTable("Holdings", {
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

  await createTable("Liabilities", {
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

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
