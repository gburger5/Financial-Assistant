import "dotenv/config";
import { buildApp } from "./app";

const app = buildApp();

const port = Number(process.env.PORT ?? 4000);

await app.listen({ port, host: "0.0.0.0" });