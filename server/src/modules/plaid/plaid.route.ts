/**
 * @module plaid.route
 * @description Fastify route plugin for the Plaid HTTP endpoints.
 *
 * Routes:
 *   GET  /link-token      — Creates a Plaid Link token (auth required)
 *   POST /exchange-token  — Exchanges a public token for an access token (auth required)
 *   POST /webhook         — Receives Plaid webhook events (no auth — Plaid calls this)
 *
 * Schema definitions are inline here; there is no separate plaid.schema.ts.
 * Only the exchange-token route requires a body schema — the webhook route
 * intentionally omits one because Plaid adds new fields regularly and schema
 * validation would strip data that might be useful to log.
 *
 * The rawBody content-type parser is scoped to the webhook sub-plugin only.
 * It stores the exact request bytes in request.rawBody before JSON.parse runs,
 * so the signature verifier sees the same bytes Plaid signed. Registering it
 * globally would override Fastify's default JSON parser on every route.
 *
 * Security notes:
 *   - verifyJWT preHandler protects link-token and exchange-token.
 *   - The webhook route has no verifyJWT — Plaid's servers call it, not users.
 *     Authentication is handled by Plaid signature verification inside handleWebhook.
 *   - additionalProperties: false on the exchange-token body blocks mass assignment
 *     before the handler even runs.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { verifyJWT } from '../../plugins/auth.plugin.js';
import {
  createLinkToken,
  exchangePublicToken,
  getSyncStatus,
  manualSync,
  handleWebhook,
} from './plaid.controller.js';
import type { ExchangePublicTokenBody } from './plaid.types.js';

/**
 * Registers all /api/plaid routes on the Fastify instance.
 * Call this with app.register(plaidRoutes, { prefix: '/api/plaid' }).
 *
 * @param {FastifyInstance} fastify
 * @returns {Promise<void>}
 */
async function plaidRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /link-token
   * Returns a short-lived Plaid Link token for the authenticated user.
   * The token is consumed by the Plaid Link iframe on the frontend.
   */
  fastify.get('/link-token', {
    preHandler: [verifyJWT],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            linkToken: { type: 'string' },
          },
        },
      },
    },
  }, createLinkToken);

  /**
   * POST /exchange-token
   * Exchanges a Plaid Link public token for a permanent access token.
   * The body schema uses additionalProperties: false to block mass assignment
   * at the framework level before the controller is ever called.
   */
  fastify.post<{ Body: ExchangePublicTokenBody }>('/exchange-token', {
    preHandler: [verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['publicToken', 'institutionId', 'institutionName'],
        properties: {
          publicToken: { type: 'string', minLength: 1 },
          institutionId: { type: 'string', minLength: 1 },
          institutionName: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            itemId: { type: 'string' },
          },
        },
      },
    },
  }, exchangePublicToken);

  /**
   * GET /sync-status
   * Returns itemsLinked, itemsSynced, and ready for the authenticated user.
   * The client polls this after linking a bank account, waiting for ready === true
   * before calling POST /budget/initialize.
   */
  fastify.get('/sync-status', {
    preHandler: [verifyJWT],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            itemsLinked: { type: 'integer' },
            itemsSynced: { type: 'integer' },
            ready: { type: 'boolean' },
          },
        },
      },
    },
  }, getSyncStatus);

  /**
   * POST /sync
   * Manually triggers a transaction sync for all active items belonging to the
   * authenticated user. Intended for local development (no webhooks) and for
   * users who want to force a refresh after approving a proposal.
   */
  fastify.post('/sync', {
    preHandler: [verifyJWT],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            added: { type: 'integer' },
            modified: { type: 'integer' },
            removed: { type: 'integer' },
          },
        },
      },
    },
  }, manualSync);

  /**
   * POST /webhook sub-plugin
   * Encapsulated so the custom rawBody content-type parser is scoped here
   * and does not override Fastify's default JSON parser on other routes.
   */
  fastify.register(async function webhookPlugin(app: FastifyInstance) {
    /**
     * Custom application/json parser that stores the raw request body string
     * in request.rawBody before calling JSON.parse. This is required so
     * verifyWebhookSignature can hash the exact bytes Plaid signed.
     *
     * Scoped to this sub-plugin only — other routes in the plaid plugin
     * continue to use Fastify's built-in JSON parser.
     */
    app.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      function (_req: FastifyRequest, body: string, done: (err: Error | null, result?: unknown) => void) {
        (_req as FastifyRequest & { rawBody?: string }).rawBody = body;
        try {
          done(null, JSON.parse(body));
        } catch (err) {
          done(err as Error);
        }
      },
    );

    /**
     * POST /webhook
     * No verifyJWT preHandler — Plaid's servers call this, not authenticated users.
     * No body schema — Plaid adds fields regularly; strict validation would
     * reject legitimate webhooks or strip data useful for logging.
     * Authentication is handled by Plaid signature verification inside handleWebhook.
     */
    app.post('/webhook', {}, handleWebhook);
  });
}

export default plaidRoutes;
