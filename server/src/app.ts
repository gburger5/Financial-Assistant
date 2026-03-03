/**
 * @module app
 * @description Builds and configures the Fastify application instance.
 * Call buildApp() to get a configured app without starting the server.
 * The server.ts entry-point calls listen() on the result.
 *
 * Logging strategy — "consolidate logs at creation time":
 * Default Fastify request logging is disabled. Instead, the lifecycle hooks
 * in src/hooks/hooks.ts accumulate context across onRequest → preHandler →
 * onError and emit a single structured JSON line per request in onResponse.
 * This makes filtering (url + status, p99 latency, userId) trivial with no
 * join logic across multiple log records.
 */
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import gracefulShutdown from 'fastify-graceful-shutdown';
import rateLimit from '@fastify/rate-limit';
import errorHandlerPlugin from './plugins/errorHandler.plugin.js';
import authRoutes from './modules/auth/auth.route.js';
import budgetRoutes from './modules/budget/budget.route.js';
import plaidRoutes from './modules/plaid/plaid.route.js';
import { createLogger } from './lib/logger.js';
import { registerHooks } from './hooks/hooks.js';

// ---------------------------------------------------------------------------
// Fastify request type augmentations
// ---------------------------------------------------------------------------

/**
 * Extend FastifyRequest with two properties that our lifecycle hooks write to:
 *
 * startTime   — captured in onRequest via process.hrtime.bigint() so we have
 *               nanosecond-precision timing. BigInt cannot be JSON-serialised,
 *               which is intentional — it is only read inside onResponse.
 *
 * logContext  — plain object accumulator. onRequest seeds it with HTTP fields;
 *               preHandler appends user.id (when authenticated); onError appends
 *               error context. onResponse spreads it into the final log line.
 */
declare module 'fastify' {
  interface FastifyRequest {
    startTime: bigint;
    logContext: Record<string, unknown>;
  }
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

/**
 * Creates and wires up the Fastify application with all plugins and routes.
 * Does not call listen() — that is the responsibility of the server entry-point.
 *
 * @returns {FastifyInstance} A fully configured app instance, ready to call
 *   inject() on in tests or listen() on in production.
 */
export function buildApp(): FastifyInstance {
  const logger = createLogger();

  const app = Fastify({
    // Pass the pre-built pino logger instance. Fastify's `logger` option only
    // accepts a configuration object; `loggerInstance` is the correct option
    // for a fully constructed logger (e.g. one created by createLogger()).
    loggerInstance: logger as FastifyBaseLogger,

    // Suppress Fastify's automatic "incoming request" / "request completed"
    // log pairs. Our consolidated onResponse hook replaces both with a single
    // structured record containing every field we care about.
    disableRequestLogging: true,

    /**
     * Generate a UUID v4 for every request instead of auto-incrementing integers.
     * UUIDs are collision-free across multiple instances — essential in a
     * distributed / lambda environment where several containers handle traffic.
     *
     * If the upstream service or the client sends a W3C Trace Context header
     * (traceparent) or a simple x-request-id, we propagate it so the same ID
     * appears in every service's logs for the same user action.
     *
     * @param {import('http').IncomingMessage} req - Raw Node.js request object.
     * @returns {string} The request ID to bind to req.id and req.log.
     */
    genReqId(req) {
      // x-request-id is a widely-used convention for browser → server propagation.
      const xRequestId = req.headers['x-request-id'];
      if (typeof xRequestId === 'string' && xRequestId) return xRequestId;

      // traceparent follows the W3C Trace Context spec used by OpenTelemetry.
      // Format: 00-{traceId}-{spanId}-{flags}. Carry it through as-is so every
      // service in the call graph logs the same trace root.
      const traceparent = req.headers['traceparent'];
      if (typeof traceparent === 'string' && traceparent) return traceparent;

      // No upstream trace ID — generate a fresh UUID v4.
      return randomUUID();
    },
  });

  // Register lifecycle hooks before any routes so they fire for every request
  // including the /health probe and any future routes added below.
  registerHooks(app);

  // Restrict CORS to the configured frontend origin.
  const allowedOrigin = 'http://localhost:5500';

  app.register(cors, {
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Graceful shutdown plugin — listens for SIGINT/SIGTERM and calls
  // app.close() to allow in-flight requests to complete before exit.
  app.register(gracefulShutdown);

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

  // Budget routes: get, patch, history.
  app.register(budgetRoutes, { prefix: '/api/budget' });

  // Plaid routes: link-token, exchange-token, webhook.
  app.register(plaidRoutes, { prefix: '/api/plaid' });

  return app;
}
