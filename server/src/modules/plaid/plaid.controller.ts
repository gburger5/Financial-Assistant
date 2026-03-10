/**
 * @module plaid.controller
 * @description Thin HTTP controllers for the Plaid module.
 * Controllers extract request data and delegate to the service or webhook
 * module — no try/catch, no business logic. Errors bubble to the global handler.
 *
 * Security note: userId is always read from request.user (the verified JWT
 * payload), never from the request body. This prevents client-supplied userId
 * injection from affecting which user's data is accessed.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ExchangePublicTokenBody } from './plaid.types.js';
import * as plaidService from './plaid.service.js';
import { handleWebhook as webhookHandler } from './plaid.webhook.js';

/**
 * GET /api/plaid/link-token
 * Creates a Plaid Link token for the authenticated user.
 * The userId comes from the JWT — never from query string or body.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function createLinkToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user!.userId;
  const result = await plaidService.createLinkToken(userId);
  return reply.send(result);
}

/**
 * POST /api/plaid/exchange-token
 * Exchanges a Plaid public token for an access token and triggers initial sync.
 * The userId comes from the JWT; publicToken, institutionId, and institutionName
 * come from the validated request body.
 *
 * @param {FastifyRequest<{ Body: ExchangePublicTokenBody }>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function exchangePublicToken(
  request: FastifyRequest<{ Body: ExchangePublicTokenBody }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user!.userId;
  const { publicToken, institutionId, institutionName } = request.body;
  const result = await plaidService.linkBankAccount(
    userId,
    publicToken,
    institutionId,
    institutionName,
  );
  return reply.send(result);
}

/**
 * GET /api/plaid/sync-status
 * Returns the transaction sync status for all active items belonging to the
 * authenticated user. The frontend polls this after linking a bank account,
 * waiting until ready === true before calling POST /budget/initialize.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function getSyncStatus(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user!.userId;
  const result = await plaidService.getSyncStatus(userId);
  return reply.send(result);
}

/**
 * POST /api/plaid/sync
 * Runs a transaction sync for every active item belonging to the authenticated user.
 * Useful on localhost where Plaid webhooks cannot reach the server, and for users
 * who want to force a refresh rather than waiting for the next webhook.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function manualSync(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user!.userId;
  // Run transactions and investments in parallel — independent data sources.
  const [txResult] = await Promise.all([
    plaidService.syncAllTransactions(userId),
    plaidService.syncAllInvestments(userId),
  ]);
  return reply.send(txResult);
}

/**
 * POST /api/plaid/webhook
 * Delegates entirely to the webhook module. That module handles signature
 * verification, fire-and-forget dispatch, and always returning { received: true }.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function handleWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  return webhookHandler(request, reply);
}
