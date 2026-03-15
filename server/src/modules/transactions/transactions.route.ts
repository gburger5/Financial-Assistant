/**
 * @module transactions.route
 * @description Fastify route plugin for the Transactions HTTP endpoints.
 *
 * Routes:
 *   GET /  — Returns recent transactions for the authenticated user.
 *            Accepts optional `since` (YYYY-MM-DD) and `limit` query params.
 *            Defaults to the last 30 days when `since` is omitted.
 */
import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../plugins/auth.plugin.js';
import { getTransactionsSince } from './transactions.service.js';

/**
 * Registers all /api/transactions routes on the Fastify instance.
 * Call this with app.register(transactionRoutes, { prefix: '/api/transactions' }).
 *
 * @param {FastifyInstance} fastify
 * @returns {Promise<void>}
 */
async function transactionRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /
   * Returns transactions for the authenticated user since `since` (or last 30 days).
   * Results are sorted newest-first and capped at `limit` (default 50, max 200).
   */
  fastify.get<{
    Querystring: { since?: string; limit?: string };
  }>('/', {
    preHandler: [verifyJWT],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          limit: { type: 'string', pattern: '^\\d+$' },
        },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const userId = req.user!.userId;

    // Default to 90 days ago when no since date is provided.
    const sinceDate = req.query.since ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      return d.toISOString().slice(0, 10);
    })();

    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    // includePending: true — show both settled and pending transactions in the
    // feed. Agent-written approved transactions are initially pending until the
    // ACH transfer settles; hiding them would make approved proposals invisible.
    const all = await getTransactionsSince(userId, sinceDate, { includePending: true });

    // Sort newest-first and apply the limit.
    const transactions = all
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
      .slice(0, limit);

    return { transactions };
  });
}

export default transactionRoutes;
