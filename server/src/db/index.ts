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

// removeUndefinedValues: true — Plaid API fields that are absent (undefined) from
// a response are silently dropped rather than causing a marshalling error. Without
// this, any optional Plaid field that is missing at runtime throws
// "Pass options.removeUndefinedValues=true to remove undefined values from map/array/set."
export const db = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});
