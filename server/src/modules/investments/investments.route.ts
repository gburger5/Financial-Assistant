/**
 * @module investments.route
 * @description Fastify route plugin for the Investments HTTP endpoints.
 *
 * Routes:
 *   GET /transactions — Returns recent investment transactions for the authenticated user.
 *                        Accepts optional `since` (YYYY-MM-DD) and `limit` query params.
 *
 * Register in app.ts with: app.register(investmentRoutes, { prefix: '/api/investments' })
 */
import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../plugins/auth.plugin.js';
import { getTransactionsSince } from './investments.service.js';

/**
 * Registers all /api/investments routes on the Fastify instance.
 *
 * @param {FastifyInstance} fastify
 * @returns {Promise<void>}
 */
async function investmentRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /transactions
   * Returns investment transactions for the authenticated user since `since`
   * (or last 90 days). Sorted newest-first, capped at `limit`.
   */
  fastify.get<{
    Querystring: { since?: string; limit?: string };
  }>('/transactions', {
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

    const sinceDate = req.query.since ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      return d.toISOString().slice(0, 10);
    })();

    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    const all = await getTransactionsSince(userId, sinceDate);

    const transactions = all
      .sort((a, b) => b.dateTransactionId.localeCompare(a.dateTransactionId))
      .slice(0, limit);

    return { transactions };
  });
}

export default investmentRoutes;
