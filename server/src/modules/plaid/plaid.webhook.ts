/**
 * @module plaid.webhook
 * @description Plaid webhook event routing and per-type handler functions.
 *
 * Design decisions:
 *
 *   Always return { received: true } with 200, even for suspicious webhooks.
 *   Plaid retries on non-200 responses, generating noise and rate-limit
 *   pressure. Signature failures are logged silently — attackers learn nothing.
 *
 *   processWebhook is fire-and-forget inside handleWebhook. Plaid requires a
 *   response within seconds; sync operations take much longer. The .catch() is
 *   mandatory — unhandled promise rejections crash Node.js in newer versions.
 *
 *   Separate handler functions per webhook type so each can grow independently
 *   and be unit tested in isolation by calling the handler directly.
 *
 *   INITIAL_UPDATE and HISTORICAL_UPDATE are ignored — triggerInitialSync in
 *   plaid.service.ts already performs the full history pull on link. Processing
 *   these webhooks would trigger a redundant second sync.
 *
 *   analyzeBudget is stubbed; it will be implemented in the budget module.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyWebhookSignature } from './plaid.verification.js';
import { getItemForSync, handleLoginRequired } from '../items/items.service.js';
import { syncTransactions } from '../transactions/transactions.service.js';
import { updateInvestments } from '../investments/investments.service.js';
import { updateLiabilities } from '../liabilities/liabilities.service.js';
import { createLogger } from '../../lib/logger.js';
import type { PlaidWebhookBody } from './plaid.types.js';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Per-type webhook handlers — exported for direct unit testing
// ---------------------------------------------------------------------------

/**
 * Handles TRANSACTIONS webhook events.
 *
 * SYNC_UPDATES_AVAILABLE triggers an incremental transaction sync.
 * INITIAL_UPDATE and HISTORICAL_UPDATE are ignored — the full history pull
 * was already performed by triggerInitialSync at link time. Processing these
 * codes here would trigger a redundant second sync.
 *
 * @param {string} userId - UUID of the user who owns the bank connection.
 * @param {string} itemId - Plaid item ID of the bank connection to sync.
 * @param {string} webhookCode - Specific event code from Plaid.
 * @returns {Promise<void>}
 */
export async function handleTransactionsWebhook(
  userId: string,
  itemId: string,
  webhookCode: string,
): Promise<void> {
  // Ignore codes that are already handled by the initial sync on link.
  if (webhookCode === 'INITIAL_UPDATE' || webhookCode === 'HISTORICAL_UPDATE') {
    logger.info(
      { webhookCode, itemId },
      'Ignoring INITIAL/HISTORICAL_UPDATE — covered by triggerInitialSync',
    );
    return;
  }

  if (webhookCode === 'SYNC_UPDATES_AVAILABLE') {
    await syncTransactions(userId, itemId);
    // TODO: analyzeBudget will be implemented in the budget module.
    // await analyzeBudget(userId);
  }
}

/**
 * Handles INVESTMENTS_TRANSACTIONS webhook events.
 * DEFAULT_UPDATE fires when new investment transactions are available.
 * INITIAL_UPDATE is ignored (covered by triggerInitialSync).
 *
 * @param {string} userId - UUID of the user who owns the bank connection.
 * @param {string} itemId - Plaid item ID of the bank connection to sync.
 * @param {string} webhookCode - Specific event code from Plaid.
 * @returns {Promise<void>}
 */
export async function handleInvestmentsWebhook(
  userId: string,
  itemId: string,
  webhookCode: string,
): Promise<void> {
  if (webhookCode === 'INITIAL_UPDATE') {
    logger.info({ webhookCode, itemId }, 'Ignoring INVESTMENTS_TRANSACTIONS/INITIAL_UPDATE');
    return;
  }

  if (webhookCode === 'DEFAULT_UPDATE') {
    await updateInvestments(userId, itemId);
  }
}

/**
 * Handles HOLDINGS webhook events.
 * HOLDINGS_DEFAULT_UPDATE fires when the current holdings snapshot has changed.
 *
 * @param {string} userId - UUID of the user who owns the bank connection.
 * @param {string} itemId - Plaid item ID of the bank connection to sync.
 * @returns {Promise<void>}
 */
export async function handleHoldingsWebhook(userId: string, itemId: string): Promise<void> {
  await updateInvestments(userId, itemId);
}

/**
 * Handles ITEM webhook events.
 *
 * ITEM_LOGIN_REQUIRED — the user's credentials are no longer valid. Mark
 *   the item as 'bad' so sync functions skip it until the user re-authenticates.
 *
 * PENDING_EXPIRATION — Plaid consent is about to expire. Log only; no action
 *   required until we build a consent-renewal flow.
 *
 * @param {string} itemId - Plaid item ID of the affected bank connection.
 * @param {string} userId - UUID of the user who owns the bank connection.
 * @param {string} webhookCode - Specific event code from Plaid.
 * @returns {Promise<void>}
 */
export async function handleItemWebhook(
  itemId: string,
  userId: string,
  webhookCode: string,
): Promise<void> {
  if (webhookCode === 'ITEM_LOGIN_REQUIRED') {
    logger.warn({ itemId, userId }, 'ITEM_LOGIN_REQUIRED — marking item as bad');
    await handleLoginRequired(itemId);
    return;
  }

  if (webhookCode === 'PENDING_EXPIRATION') {
    logger.info({ itemId, userId }, 'PENDING_EXPIRATION — consent expiry approaching');
    // No automated action yet; notify the user via a future notification flow.
    return;
  }

  logger.warn({ itemId, webhookCode }, 'Unhandled ITEM webhook code');
}

/**
 * Handles LIABILITIES webhook events.
 * DEFAULT_UPDATE fires when liability data has changed.
 *
 * @param {string} itemId - Plaid item ID of the bank connection to sync.
 * @param {string} webhookCode - Specific event code from Plaid.
 * @returns {Promise<void>}
 */
export async function handleLiabilitiesWebhook(
  itemId: string,
  webhookCode: string,
): Promise<void> {
  if (webhookCode === 'DEFAULT_UPDATE') {
    await updateLiabilities(itemId);
  }
}

// ---------------------------------------------------------------------------
// Internal orchestration
// ---------------------------------------------------------------------------

/**
 * Routes a verified webhook body to the correct type handler.
 * Called fire-and-forget from handleWebhook — the HTTP response is sent
 * before this function resolves.
 *
 * Fetches the item to obtain the userId (needed by most handlers). Not finding
 * the item logs a warning and returns — there is no valid action for an item
 * we do not recognise.
 *
 * @param {PlaidWebhookBody} body - The parsed (and signature-verified) webhook body.
 * @returns {Promise<void>}
 */
async function processWebhook(body: PlaidWebhookBody): Promise<void> {
  const { webhook_type, webhook_code, item_id } = body;

  // Load the item to get the userId required by handler functions.
  const item = await getItemForSync(item_id);
  const { userId } = item;

  switch (webhook_type) {
    case 'TRANSACTIONS':
      await handleTransactionsWebhook(userId, item_id, webhook_code);
      break;

    case 'INVESTMENTS_TRANSACTIONS':
      await handleInvestmentsWebhook(userId, item_id, webhook_code);
      break;

    case 'HOLDINGS':
      await handleHoldingsWebhook(userId, item_id);
      break;

    case 'ITEM':
      await handleItemWebhook(item_id, userId, webhook_code);
      break;

    case 'LIABILITIES':
      await handleLiabilitiesWebhook(item_id, webhook_code);
      break;

    default:
      logger.warn({ webhook_type, webhook_code, item_id }, 'Unknown webhook type — ignoring');
  }
}

// ---------------------------------------------------------------------------
// Main exported handler — called by the controller
// ---------------------------------------------------------------------------

/**
 * Main webhook handler called by the Plaid route.
 *
 * Verifies the Plaid signature first. A failed verification is logged and
 * silently dropped — the response is still 200 so Plaid does not retry.
 *
 * On success, processWebhook runs fire-and-forget. Plaid requires a response
 * within a few seconds; sync operations can take minutes for large histories.
 * The .catch() prevents unhandled rejection crashes.
 *
 * @param {FastifyRequest} request - The incoming Fastify request.
 * @param {FastifyReply} reply - The Fastify reply used to send the response.
 * @returns {Promise<void>}
 */
export async function handleWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await verifyWebhookSignature(request);
  } catch (err) {
    logger.warn({ err }, 'Webhook signature verification failed — ignoring');
    return reply.status(200).send({ received: true });
  }

  const body = request.body as PlaidWebhookBody;

  // Fire-and-forget: sync may take minutes; Plaid requires a response in seconds.
  // The .catch() is mandatory — unhandled rejections crash Node.js in modern versions.
  processWebhook(body).catch((err) =>
    logger.error({ err, item_id: body.item_id }, 'processWebhook failed'),
  );

  return reply.status(200).send({ received: true });
}
