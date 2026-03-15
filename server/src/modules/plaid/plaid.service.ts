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
import { Products, CountryCode } from 'plaid'
import { plaidClient } from '../../lib/plaidClient.js';
import { encrypt } from '../../lib/encryption.js';
import { linkItem, getItemsForUser, updateCursor } from '../items/items.service.js';
import { syncTransactions } from '../transactions/transactions.service.js';
import { updateInvestments } from '../investments/investments.service.js';
import { updateLiabilities } from '../liabilities/liabilities.service.js';
import { createLogger } from '../../lib/logger.js';
import type { LinkBankAccountResult, SyncStatus } from './plaid.types.js';

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
  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: 'Financial Assistant',
    products: [Products.Transactions],
    // Transfer is a server-side API — it cannot be listed as a Link product
    // and causes Plaid to return 400 if included here.
    optional_products: [Products.Investments, Products.Liabilities],
    country_codes: [CountryCode.Us],
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
 * Transactions use cursor-based sync and are polled up to MAX_POLL_RETRIES
 * times because Plaid prepares historical data asynchronously after link.
 * The cursor is NOT committed during polling — committing an empty cursor
 * between retries would advance past historical data that Plaid hasn't
 * delivered yet. The cursor is committed exactly once after polling ends.
 *
 * Investments use a GET-based API (not cursor-based) — a single call is
 * sufficient with no polling needed.
 *
 * All three products are optional. If an item does not have one enabled, Plaid
 * returns an ITEM_ERROR (e.g. NO_INVESTMENT_ACCOUNTS). These are not failures —
 * they mean the product is not supported on this item. The error is logged at
 * info level and the remaining steps continue. Non-ITEM_ERROR failures (network,
 * auth, unexpected 5xx) are still propagated.
 *
 * @param {string} userId - UUID of the user who owns the bank connection.
 * @param {string} itemId - Plaid item ID of the newly linked bank connection.
 * @returns {Promise<void>}
 */
export async function triggerInitialSync(userId: string, itemId: string): Promise<void> {
  const MAX_POLL_RETRIES = 5;
  const POLL_DELAY_MS = 2000;

  // --- Transactions (cursor-based sync) ---
  // commitCursor: false prevents syncTransactions from persisting the cursor
  // between poll attempts. If Plaid returns an empty page because historical
  // data isn't ready yet, committing the cursor would advance past the window
  // where that data will be delivered — permanently losing it.
  try {
    let txResult = await syncTransactions(userId, itemId, { commitCursor: false });

    for (let attempt = 1; attempt < MAX_POLL_RETRIES && txResult.addedCount === 0; attempt++) {
      logger.info(
        { userId, itemId, attempt, maxRetries: MAX_POLL_RETRIES },
        'No transactions on initial sync — waiting for Plaid to process history',
      );
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_DELAY_MS));
      txResult = await syncTransactions(userId, itemId, { commitCursor: false });
    }

    // Commit cursor exactly once — either data arrived or retries are exhausted.
    await updateCursor(itemId, txResult.nextCursor);

    if (txResult.addedCount === 0) {
      logger.warn(
        { userId, itemId },
        'No transactions after polling — HISTORICAL_UPDATE webhook will trigger a follow-up sync',
      );
    }
  } catch (err) {
    if (plaidErrorType(err) === 'ITEM_ERROR') {
      logger.info(
        { errorCode: plaidErrorCode(err), userId, itemId },
        'Transactions product not available on this item — skipping',
      );
      // Set cursor to "" so getSyncStatus counts this item as synced.
      // null means "never attempted"; "" means "attempted but product unsupported".
      await updateCursor(itemId, '').catch((updateErr) =>
        logger.warn({ updateErr, itemId }, 'Failed to set empty cursor after ITEM_ERROR skip'),
      );
    } else {
      throw err;
    }
  }

  // --- Investments (GET-based, no cursor — single call, no polling needed) ---
  try {
    await updateInvestments(userId, itemId);
  } catch (err) {
    if (plaidErrorType(err) === 'ITEM_ERROR') {
      logger.info(
        { errorCode: plaidErrorCode(err), userId, itemId },
        'Investments product not available on this item — skipping',
      );
    } else {
      throw err;
    }
  }

  // --- Liabilities ---
  try {
    await updateLiabilities(itemId);
  } catch (err) {
    if (plaidErrorType(err) === 'ITEM_ERROR') {
      logger.info(
        { errorCode: plaidErrorCode(err), userId, itemId },
        'Liabilities product not available on this item — skipping',
      );
    } else {
      throw err;
    }
  }
}

/**
 * Runs a transaction sync for every active item belonging to a user.
 * Useful for local development where Plaid webhooks cannot reach localhost,
 * and for users who want to force a refresh rather than waiting for a webhook.
 *
 * @param {string} userId - UUID of the authenticated user.
 * @returns {Promise<{ added: number; modified: number; removed: number }>}
 */
export async function syncAllTransactions(
  userId: string,
): Promise<{ added: number; modified: number; removed: number }> {
  const items = await getItemsForUser(userId);
  const activeItems = items.filter((i) => i.status === 'active');

  let added = 0;
  let modified = 0;
  let removed = 0;

  for (const item of activeItems) {
    try {
      const result = await syncTransactions(userId, item.itemId);
      added += result.addedCount;
      modified += result.modifiedCount;
      removed += result.removedCount;
    } catch (err) {
      logger.warn({ err, itemId: item.itemId }, 'syncAllTransactions: item sync failed — skipping');
    }
  }

  return { added, modified, removed };
}

/**
 * Runs an investment holdings + accounts sync for every active item belonging
 * to a user. Called from the manual sync endpoint so the dashboard Sync button
 * refreshes investment data in addition to transactions.
 *
 * Skips items where the investments product is not enabled (ITEM_ERROR) rather
 * than aborting the whole batch — a checking-only account should not prevent
 * a Schwab investment account from syncing.
 *
 * @param {string} userId - UUID of the authenticated user.
 * @returns {Promise<void>}
 */
export async function syncAllInvestments(userId: string): Promise<void> {
  const items = await getItemsForUser(userId);
  const activeItems = items.filter((i) => i.status === 'active');

  for (const item of activeItems) {
    try {
      await updateInvestments(userId, item.itemId);
    } catch (err) {
      if (plaidErrorType(err) === 'ITEM_ERROR') {
        logger.info(
          { errorCode: plaidErrorCode(err), userId, itemId: item.itemId },
          'syncAllInvestments: investments product not available on this item — skipping',
        );
      } else {
        logger.warn({ err, itemId: item.itemId }, 'syncAllInvestments: item sync failed — skipping');
      }
    }
  }
}

/**
 * Returns the transaction sync status for all active items belonging to a user.
 * Used by the frontend polling loop: the client calls this after linking a bank
 * and waits until ready === true before calling POST /budget/initialize.
 *
 * An item is considered synced once transactionCursor is non-null:
 *   - null  → syncTransactions has never been attempted for this item
 *   - ""    → attempted but the transactions product is not supported (ITEM_ERROR)
 *   - "..." → a real Plaid cursor; at least one sync has completed
 *
 * @param {string} userId - UUID of the authenticated user.
 * @returns {Promise<SyncStatus>}
 */
export async function getSyncStatus(userId: string): Promise<SyncStatus> {
  const items = await getItemsForUser(userId);
  const activeItems = items.filter((i) => i.status === 'active');
  const itemsLinked = activeItems.length;
  const itemsSynced = activeItems.filter((i) => i.transactionCursor !== null).length;
  const ready = itemsLinked > 0 && itemsSynced === itemsLinked;
  return { itemsLinked, itemsSynced, ready };
}
