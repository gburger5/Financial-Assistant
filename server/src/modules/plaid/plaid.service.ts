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
 *   - analyzeBudget is stubbed with a TODO; it will be implemented in the
 *     budget module in a future session.
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
    process.env.PLAID_PRODUCTS?.split(',') ?? ['transactions', 'investments', 'liabilities']
  ) as Products[];

  const countryCodes = (
    process.env.PLAID_COUNTRY_CODES?.split(',') ?? ['US']
  ) as CountryCode[];

  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: process.env.PLAID_CLIENT_NAME ?? 'Financial Assistant',
    products,
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
 * Runs a full Plaid data sync for all three product types on a newly linked
 * bank connection: transactions, investments, and liabilities.
 *
 * Sequential (not parallel) to avoid non-deterministic concurrent writes to
 * the same account records in DynamoDB. Each sync calls syncAccounts internally,
 * so running them in parallel would produce three simultaneous upserts to the
 * same account rows with no defined ordering.
 *
 * @param {string} userId - UUID of the user who owns the bank connection.
 * @param {string} itemId - Plaid item ID of the newly linked bank connection.
 * @returns {Promise<void>}
 */
export async function triggerInitialSync(userId: string, itemId: string): Promise<void> {
  await syncTransactions(userId, itemId);
  await updateInvestments(userId, itemId);
  await updateLiabilities(itemId);

  // TODO: analyzeBudget will be implemented in the budget module.
  // await analyzeBudget(userId);
}
