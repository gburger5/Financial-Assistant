import { awsLambdaFastify } from "@fastify/aws-lambda";
import { buildApp } from "./app";

const app = buildApp();

export const handler = awsLambdaFastify(app);