import "dotenv/config";
import Fastify from "fastify";

const app = Fastify({ logger: true });

const port = Number(process.env.PORT ?? 4000);

await app.listen({ port, host: "0.0.0.0" });