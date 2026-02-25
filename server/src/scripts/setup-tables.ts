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
  await createTable("users", {
    TableName: "users",
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

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
