/**
 * @module app
 * @description Builds and configures the Fastify application instance.
 * Call buildApp() to get a configured app without starting the server.
 * The server.ts entry-point calls listen() on the result.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helment from '@fastify/helmet';
import compress from '@fastify/compress';
import gracefulShutdown from 'fastify-graceful-shutdown';
import rateLimit from '@fastify/rate-limit';
import errorHandlerPlugin from './plugins/errorHandler.plugin.js';
import authRoutes from './modules/auth/auth.route.js';

/**
 * Creates and wires up the Fastify application with all plugins and routes.
 * Does not call listen() — that is the responsibility of the server entry-point.
 *
 * @returns A fully configured app instance.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  // Restrict CORS to the configured frontend origin.
  const allowedOrigin = 'http://localhost:3000';

  app.register(cors, {
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global rate limiting — tightened per-route limits are applied in route plugins.
  app.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
    cache: 10000,
  });

  // Global error and not-found handlers. Must be registered before routes.
  app.register(errorHandlerPlugin);

  // Health probe — no auth required.
  app.get('/health', async () => {
    return { status: 'ok' };
  });

  // Auth routes: register, login, verify.
  app.register(authRoutes, { prefix: '/api/auth' });

  return app;
}
