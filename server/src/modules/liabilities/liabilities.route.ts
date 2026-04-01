/**
 * @module liabilities.route
 * @description Fastify route plugin for the Liabilities HTTP endpoints.
 *
 * Routes:
 *   GET / — Returns the latest liability snapshot for the authenticated user.
 *
 * Register in app.ts with: app.register(liabilitiesRoutes, { prefix: '/api/liabilities' })
 */
import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../plugins/auth.plugin.js';
import { getLiabilitiesForUser } from './liabilities.service.js';

/**
 * Registers all /api/liabilities routes on the Fastify instance.
 *
 * @param {FastifyInstance} fastify
 * @returns {Promise<void>}
 */
async function liabilitiesRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /
   * Returns the latest liability snapshot per account for the authenticated user.
   */
  fastify.get('/', {
    preHandler: [verifyJWT],
  }, async (req) => {
    const userId = req.user!.userId;
    const liabilities = await getLiabilitiesForUser(userId);
    return { liabilities };
  });
}

export default liabilitiesRoutes;
