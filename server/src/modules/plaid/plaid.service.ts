/**
 * @module plaid.service
 * @description Business logic layer for the Plaid orchestration module.
 * Handles link token creation, public token exchange, and the initial data
 * sync triggered immediately after a user links a bank account.
 *
 * Design decisions:
 *   - linkBankAccount lets itemPublicTokenExchange errors propagate. If the
 *     token exchange fails the user must re-link — swallowing the error would
 *     leave the UI in an ambiguous "linked but not synced" state.
 *   - triggerInitialSync is called fire-and-forget from linkBankAccount. The
 *     full history pull (transactions + investments + liabilities) can take
 *     30-60 seconds for large accounts; the HTTP response cannot wait for it.
 *   - triggerInitialSync runs the three sync functions sequentially, not with
 *     Promise.all. All three call accountsService.syncAccounts with data from
 *     their Plaid responses. Parallel execution creates three concurrent upserts
 *     to the same account records — last-write-wins is non-deterministic.
 *     Sequential writes are idempotent and deterministic.
 *   - investments and liabilities are optional products in createLinkToken. An
 *     item may not have them enabled (e.g. a checking-only institution). When
 *     Plaid returns an ITEM_ERROR (e.g. NO_INVESTMENT_ACCOUNTS), triggerInitialSync
 *     logs the skip and continues rather than propagating the error.
 */
import type { Products, CountryCode } from 'plaid';
import { plaidClient } from '../../lib/plaidClient.js';
import { encrypt } from '../../lib/encryption.js';
import { linkItem } from '../items/items.service.js';
import { syncTransactions } from '../transactions/transactions.service.js';
import { updateInvestments } from '../investments/investments.service.js';
import { updateLiabilities } from '../liabilities/liabilities.service.js';
import { createLogger } from '../../lib/logger.js';
import type { LinkBankAccountResult } from './plaid.types.js';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Public service methods
// ---------------------------------------------------------------------------

/**
 * Creates a Plaid Link token for the authenticated user.
 * The token is short-lived (30 min) and used by the frontend to initialise
 * the Plaid Link iframe. It encodes the products, country codes, and webhook
 * URL configured in environment variables.
 *
 * @param {string} userId - UUID of the user initiating the link flow.
 * @returns {Promise<{ linkToken: string }>} The link token string.
 */
export async function createLinkToken(userId: string): Promise<{ linkToken: string }> {
  const products = (
   ['transactions']
  ) as Products[];

  const optional_products = (
    ['investments', 'liabilities']
  ) as Products[];

  const countryCodes = (
    process.env.PLAID_COUNTRY_CODES?.split(',') ?? ['US']
  ) as CountryCode[];

  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: 'Financial Assistant',
    products,
    optional_products,
    country_codes: countryCodes,
    language: 'en',
    webhook: process.env.PLAID_WEBHOOK_URL,
  });

  return { linkToken: response.data.link_token };
}

/**
 * Exchanges a Plaid public token for a permanent access token, encrypts it,
 * persists the item record, and fires an initial full-history sync.
 *
 * The token exchange error is intentionally NOT caught here. If Plaid rejects
 * the exchange the user must restart the Link flow — there is nothing to retry.
 *
 * triggerInitialSync is fire-and-forget. The HTTP response is returned to the
 * client as soon as the item is saved; sync runs asynchronously in the background.
 * The .catch() is mandatory — unhandled rejections crash Node.js in modern versions.
 *
 * @param {string} userId - UUID of the authenticated user.
 * @param {string} publicToken - Short-lived token from the Plaid Link callback.
 * @param {string} institutionId - Plaid institution ID (e.g. "ins_3").
 * @param {string} institutionName - Human-readable institution name (e.g. "Chase").
 * @returns {Promise<LinkBankAccountResult>}
 */
export async function linkBankAccount(
  userId: string,
  publicToken: string,
  institutionId: string,
  institutionName: string,
): Promise<LinkBankAccountResult> {
  // Exchange the public token for a permanent access token.
  const exchangeResponse = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });

  const { access_token: accessToken, item_id: itemId } = exchangeResponse.data;

  // Encrypt the access token before storing — never persist plaintext tokens.
  const encryptedAccessToken = encrypt(accessToken);

  await linkItem({ userId, itemId, encryptedAccessToken, institutionId, institutionName });

  // Fire-and-forget: initial sync takes 30–60 s; the HTTP response cannot wait.
  triggerInitialSync(userId, itemId).catch((err) =>
    logger.error({ err, userId, itemId }, 'triggerInitialSync failed'),
  );

  return { message: 'Bank account linked successfully', itemId };
}

/**
 * Extracts the Plaid error_type from an unknown thrown value.
 * Plaid SDK wraps all API errors as Axios errors; the Plaid error payload
 * is on err.response.data. Returns null for non-Plaid errors.
 *
 * @param {unknown} err - The caught error.
 * @returns {string | null} The Plaid error_type string, or null.
 */
function plaidErrorType(err: unknown): string | null {
  const axiosErr = err as { response?: { data?: { error_type?: string } } };
  return axiosErr?.response?.data?.error_type ?? null;
}

/**
 * Extracts the Plaid error_code from an unknown thrown value.
 *
 * @param {unknown} err - The caught error.
 * @returns {string | null} The Plaid error_code string, or null.
 */
function plaidErrorCode(err: unknown): string | null {
  const axiosErr = err as { response?: { data?: { error_code?: string } } };
  return axiosErr?.response?.data?.error_code ?? null;
}

/**
 * Runs a full Plaid data sync for all three product types on a newly linked
 * bank connection: transactions, investments, and liabilities.
 *
 * Sequential (not parallel) to avoid non-deterministic concurrent writes to
 * the same account records in DynamoDB. Each sync calls syncAccounts internally,
 * so running them in parallel would produce three simultaneous upserts to the
 * same account rows with no defined ordering.
 *
 * All three products are optional. If an item does not have one enabled, Plaid
 * returns an ITEM_ERROR (e.g. NO_INVESTMENT_ACCOUNTS). These are not failures —
 * they mean the product is not supported on this item. The error is logged at
 * info level and the remaining steps continue. Non-ITEM_ERROR failures (network,
 * auth, unexpected 5xx) are still propagated.
 *
 * transactions may return 0 results when called immediately after link — Plaid
 * processes history asynchronously. The HISTORICAL_UPDATE webhook (handled in
 * plaid.webhook.ts) triggers a follow-up sync once data is confirmed ready.
 *
 * @param {string} userId - UUID of the user who owns the bank connection.
 * @param {string} itemId - Plaid item ID of the newly linked bank connection.
 * @returns {Promise<void>}
 */
export async function triggerInitialSync(userId: string, itemId: string): Promise<void> {
  // TRACE-LOG: temporary instrumentation for onboarding audit — remove after run
  console.log(`[TRACE] triggerInitialSync START  userId=${userId} itemId=${itemId}`);

  console.log('[TRACE] triggerInitialSync step 1/3: syncTransactions …');
  try {
    const txResult = await syncTransactions(userId, itemId);
    console.log('[TRACE] triggerInitialSync step 1/3 DONE:', JSON.stringify(txResult));
  } catch (err) {
    if (plaidErrorType(err) === 'ITEM_ERROR') {
      // Product not enabled on this item — not a failure.
      logger.info(
        { errorCode: plaidErrorCode(err), userId, itemId },
        'Transactions product not available on this item — skipping',
      );
      console.log(`[TRACE] triggerInitialSync step 1/3 SKIPPED (${plaidErrorCode(err)})`);
    } else {
      throw err;
    }
  }

  console.log('[TRACE] triggerInitialSync step 2/3: updateInvestments …');
  try {
    await updateInvestments(userId, itemId);
    console.log('[TRACE] triggerInitialSync step 2/3 DONE');
  } catch (err) {
    if (plaidErrorType(err) === 'ITEM_ERROR') {
      // Product not enabled on this item — not a failure.
      logger.info(
        { errorCode: plaidErrorCode(err), userId, itemId },
        'Investments product not available on this item — skipping',
      );
      console.log(`[TRACE] triggerInitialSync step 2/3 SKIPPED (${plaidErrorCode(err)})`);
    } else {
      throw err;
    }
  }

  console.log('[TRACE] triggerInitialSync step 3/3: updateLiabilities …');
  try {
    await updateLiabilities(itemId);
    console.log('[TRACE] triggerInitialSync step 3/3 DONE');
  } catch (err) {
    if (plaidErrorType(err) === 'ITEM_ERROR') {
      // Product not enabled on this item — not a failure.
      logger.info(
        { errorCode: plaidErrorCode(err), userId, itemId },
        'Liabilities product not available on this item — skipping',
      );
      console.log(`[TRACE] triggerInitialSync step 3/3 SKIPPED (${plaidErrorCode(err)})`);
    } else {
      throw err;
    }
  }

  console.log(`[TRACE] triggerInitialSync COMPLETE userId=${userId} itemId=${itemId}`);
}
