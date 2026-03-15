/**
 * @module accounts.route
 * @description Fastify route plugin for the Accounts HTTP endpoints.
 *
 * Routes:
 *   GET /  — Returns all linked bank accounts for the authenticated user.
 */
import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../plugins/auth.plugin.js';
import { getAccountsForUser } from './accounts.service.js';

/**
 * Registers all /api/accounts routes on the Fastify instance.
 * Call this with app.register(accountRoutes, { prefix: '/api/accounts' }).
 *
 * @param {FastifyInstance} fastify
 * @returns {Promise<void>}
 */
async function accountRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /
   * Returns all Plaid-synced accounts for the authenticated user.
   * Accounts are sorted by type then name for consistent display order.
   */
  fastify.get('/', {
    preHandler: [verifyJWT],
  }, async (req) => {
    const userId = req.user!.userId;
    const accounts = await getAccountsForUser(userId);

    const sorted = accounts.sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.name.localeCompare(b.name);
    });

    return { accounts: sorted };
  });
}

export default accountRoutes;
