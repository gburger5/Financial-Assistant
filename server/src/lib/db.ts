import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient(
  process.env.DYNAMODB_ENDPOINT
    ? {
        endpoint: process.env.DYNAMODB_ENDPOINT,
        region: process.env.AWS_REGION ?? "us-east-1",
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }
    : {}
);

export const db = DynamoDBDocumentClient.from(client);