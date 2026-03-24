/**
 * @module transactions.service
 * @description Business logic layer for the Transactions module.
 * All other modules import from here — never from the repository directly.
 *
 * Plaid cursor-based sync model:
 *   The first call (cursor = null) pulls the full transaction history, paginated.
 *   Every subsequent call passes the saved cursor and receives only the delta.
 *   The cursor is committed only after the full loop completes — saving mid-loop
 *   would permanently lose any page whose transactions failed before the cursor
 *   was advanced past them. The worst case of committing at the end is idempotent
 *   re-processing of already-stored data on the next sync.
 *
 * Error handling in the sync loop:
 *   - Upsert failures are logged-and-skipped. Plaid will re-deliver failed
 *     transactions on the next sync as "modified" entries — there is a natural
 *     retry path.
 *   - Delete failures abort the loop. If a delete is skipped and the cursor
 *     advances past it, the removed transaction stays in the database permanently
 *     with no retry path, because Plaid never re-delivers "removed" entries.
 *   - TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION restarts pagination from
 *     the pre-sync cursor. The intermediate next_cursor values are invalid;
 *     the restart re-fetches the full delta from the last committed point.
 */
import { createLogger } from '../../lib/logger.js';
import { plaidClient } from '../../lib/plaidClient.js';
import { getItemForSync, updateCursor } from '../items/items.service.js';
import { syncAccounts, getAccountsForItem } from '../accounts/accounts.service.js';
import {
  deleteByPlaidTransactionId,
  getTransactionsSince as repoGetTransactionsSince,
  getTransactionsInRange as repoGetTransactionsInRange,
  upsertTransaction,
} from './transactions.repository.js';
import type { PlaidTransaction, SyncResult, Transaction } from './transactions.types.js';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Pure mapping functions
// ---------------------------------------------------------------------------

/**
 * Maps a raw Plaid API transaction to our Transaction storage shape.
 * Pure function — no database calls, no side effects.
 *
 * sortKey is built as "date#transaction_id" to enable DynamoDB's BETWEEN
 * operator for date range queries. ISO dates sort correctly as plain strings.
 *
 * createdAt is preserved from existingCreatedAt when provided (idempotent
 * re-processing of the same transaction on subsequent syncs). updatedAt is
 * always refreshed to the current time.
 *
 * @param {string} userId - UUID of the user who owns this transaction.
 * @param {PlaidTransaction} plaidTx - Raw transaction from the Plaid API.
 * @param {string} [existingCreatedAt] - Original creation timestamp to preserve.
 * @returns {Transaction}
 */
export function mapPlaidTransaction(
  userId: string,
  plaidTx: PlaidTransaction,
  existingCreatedAt?: string,
): Transaction {
  const now = new Date().toISOString();
  const pfc = plaidTx.personal_finance_category;

  return {
    userId,
    sortKey: `${plaidTx.date}#${plaidTx.transaction_id}`,
    plaidTransactionId: plaidTx.transaction_id,
    plaidAccountId: plaidTx.account_id,
    amount: plaidTx.amount,
    date: plaidTx.date,
    name: plaidTx.name,
    merchantName: plaidTx.merchant_name,
    category: pfc?.primary ?? null,
    detailedCategory: pfc?.detailed ?? null,
    categoryIconUrl: pfc?.icon_url ?? null,
    pending: plaidTx.pending,
    isoCurrencyCode: plaidTx.iso_currency_code,
    unofficialCurrencyCode: plaidTx.unofficial_currency_code,
    createdAt: existingCreatedAt ?? now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Public service methods
// ---------------------------------------------------------------------------

/**
 * Runs a full Plaid transaction sync loop for a single bank connection.
 * Fetches all pages until has_more is false, upserts added/modified
 * transactions, deletes removed transactions, and commits the final cursor.
 *
 * Cursor commit strategy: the cursor is saved only after the entire loop
 * completes successfully. Saving mid-loop would permanently skip any pages
 * whose data was lost to a crash between page saves.
 *
 * TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION: Plaid may mutate the
 * transaction set while we are paginating (e.g. a pending transaction posts).
 * When this happens the in-progress page sequence is invalidated and Plaid
 * returns this error. Per Plaid docs, the correct recovery is to restart
 * pagination from the cursor that was committed before this sync began —
 * NOT from the most recently received next_cursor.
 *
 * @param {string} userId - UUID of the user who owns the bank connection.
 * @param {string} itemId - Plaid item ID of the bank connection to sync.
 * @param {object} [options]
 * @param {boolean} [options.commitCursor=true] - When false the cursor is NOT
 *   persisted after the sync loop. The caller is responsible for committing it
 *   via updateCursor(). Used by triggerInitialSync to prevent advancing the
 *   cursor past historical data that Plaid is still preparing.
 * @returns {Promise<SyncResult>} Counts of Plaid-returned items per operation
 *   (not counts of successful DB writes) plus the committed cursor.
 */
export async function syncTransactions(
  userId: string,
  itemId: string,
  options?: { commitCursor?: boolean },
): Promise<SyncResult> {
  const item = await getItemForSync(itemId);

  // Preserve the pre-loop cursor so we can restart from it if Plaid returns
  // TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION mid-pagination.
  const preSyncCursor: string | undefined = item.transactionCursor ?? undefined;
  let cursor: string | undefined = preSyncCursor;
  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;
  let nextCursor = cursor ?? '';
  // Set to true as soon as any depository or credit account is seen across
  // any page. Investment-only items have no such accounts and will never
  // produce transaction data; callers use this flag to skip polling.
  let hasTransactionCapableAccounts = false;
  // True when Plaid returns transactions_update_status: NOT_READY — data
  // has not been processed yet. When set, the cursor must not be committed
  // (an empty cursor would make getSyncStatus report ready prematurely).
  let notReady = false;

  let hasMore = true;
  while (hasMore) {
    let response;
    try {
      response = await plaidClient.transactionsSync({
        access_token: item.accessToken,
        // Undefined cursor triggers a full-history sync on first call.
        cursor,
        count: 500,
        options: { include_personal_finance_category: true },
      });
    } catch (err) {
      const errorCode = (err as { response?: { data?: { error_code?: string } } })
        ?.response?.data?.error_code;

      if (errorCode === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') {
        // Plaid invalidated the current page sequence due to a mid-pagination
        // mutation. Restart from the last committed cursor (preSyncCursor) so
        // we re-process only the delta we haven't yet confirmed — not from the
        // intermediate next_cursor values that are now invalid.
        logger.warn({ itemId }, 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION — restarting from pre-sync cursor');
        cursor = preSyncCursor;
        addedCount = 0;
        modifiedCount = 0;
        removedCount = 0;
        nextCursor = cursor ?? '';
        notReady = false;
        continue;
      }

      throw err;
    }

    const page = response.data;

    // Track whether Plaid has finished processing historical data.
    // NOT_READY means the accounts and transactions arrays are empty —
    // committing the cursor now would make getSyncStatus report ready.
    if (page.transactions_update_status === 'NOT_READY') {
      notReady = true;
    }

    // Sync account balances on every page — balances may change mid-sync
    // on long multi-page pulls and should be kept fresh throughout.
    await syncAccounts(userId, itemId, page.accounts);

    // Detect transaction-capable accounts (depository/credit). Once true, stays
    // true for the lifetime of this sync — no need to check subsequent pages.
    if (!hasTransactionCapableAccounts) {
      hasTransactionCapableAccounts = page.accounts.some(
        (a) => a.type === 'depository' || a.type === 'credit',
      );
    }

    // Upsert added and modified in parallel — both operations are identical writes.
    // Individual failures are logged-and-skipped; Plaid will re-deliver them as
    // "modified" on the next sync.
    await Promise.all(
      [...page.added, ...page.modified].map(async (plaidTx) => {
        try {
          const tx = mapPlaidTransaction(userId, plaidTx as PlaidTransaction);
          await upsertTransaction(tx);
        } catch (err) {
          logger.error({ err, plaidTransactionId: (plaidTx as PlaidTransaction).transaction_id },
            'Failed to upsert transaction — skipping');
        }
      }),
    );

    // Delete removed transactions sequentially within each page.
    // A delete failure aborts the loop — if we advance the cursor past a failed
    // delete, that transaction stays in the database with no retry path.
    await Promise.all(
      page.removed.map(async (removed) => {
        await deleteByPlaidTransactionId(removed.transaction_id);
      }),
    );

    addedCount += page.added.length;
    modifiedCount += page.modified.length;
    removedCount += page.removed.length;
    nextCursor = page.next_cursor;
    hasMore = page.has_more;
    cursor = page.next_cursor;
  }

  // Commit the cursor only after the full loop — never mid-loop.
  // When commitCursor is false the caller owns the commit (e.g. triggerInitialSync
  // defers it until polling completes to avoid advancing past unready data).
  // Skip the commit when Plaid returned NOT_READY — an empty cursor would
  // cause getSyncStatus to report ready before any data has been processed.
  if (options?.commitCursor !== false && !notReady) {
    await updateCursor(itemId, nextCursor);
  }

  return { addedCount, modifiedCount, removedCount, nextCursor, hasTransactionCapableAccounts, notReady };
}

/**
 * Fetches transactions for debt accounts (credit cards and loans) via Plaid's
 * transactionsGet API. In Plaid sandbox, transactionsSync does not return
 * custom transactions for debt accounts — this function fills that gap.
 *
 * Only runs for items that have credit or loan accounts. Transactions are
 * mapped and upserted identically to syncTransactions, so duplicates are
 * harmless (idempotent upsert by plaidTransactionId).
 *
 * @param {string} userId - UUID of the user who owns the bank connection.
 * @param {string} itemId - Plaid item ID of the bank connection.
 * @returns {Promise<number>} Count of transactions upserted.
 */
export async function syncDebtTransactions(
  userId: string,
  itemId: string,
): Promise<number> {
  const item = await getItemForSync(itemId);
  const accounts = await getAccountsForItem(itemId);
  const debtAccounts = accounts.filter(
    (a) => a.type === 'credit' || a.type === 'loan',
  );

  if (debtAccounts.length === 0) {
    return 0;
  }

  const debtAccountIds = debtAccounts.map((a) => a.plaidAccountId);
  const today = new Date().toISOString().slice(0, 10);
  const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let offset = 0;
  let totalTransactions = 0;
  let upsertedCount = 0;
  const PAGE_SIZE = 500;

  do {
    const response = await plaidClient.transactionsGet({
      access_token: item.accessToken,
      start_date: twoYearsAgo,
      end_date: today,
      options: {
        account_ids: debtAccountIds,
        count: PAGE_SIZE,
        offset,
        include_personal_finance_category: true,
      },
    });

    const page = response.data;
    totalTransactions = page.total_transactions;

    // Sync account balances from the first page response.
    if (offset === 0) {
      await syncAccounts(userId, itemId, page.accounts as Parameters<typeof syncAccounts>[2]);
    }

    for (const plaidTx of page.transactions) {
      try {
        const tx = mapPlaidTransaction(userId, plaidTx as PlaidTransaction);
        await upsertTransaction(tx);
        upsertedCount++;
      } catch (err) {
        logger.error(
          { err, plaidTransactionId: (plaidTx as PlaidTransaction).transaction_id },
          'syncDebtTransactions: failed to upsert transaction — skipping',
        );
      }
    }

    offset += page.transactions.length;
  } while (offset < totalTransactions);

  return upsertedCount;
}

/**
 * Returns transactions for a user on or after sinceDate.
 * Filters out pending transactions by default — pending amounts may change
 * before posting and should not be used in budget or spending calculations.
 *
 * @param {string} userId - UUID of the user whose transactions to fetch.
 * @param {string} sinceDate - YYYY-MM-DD lower bound (inclusive).
 * @param {{ includePending?: boolean }} [options]
 * @returns {Promise<Transaction[]>}
 */
export async function getTransactionsSince(
  userId: string,
  sinceDate: string,
  options?: { includePending?: boolean },
): Promise<Transaction[]> {
  const transactions = await repoGetTransactionsSince(userId, sinceDate);

  if (options?.includePending) {
    return transactions;
  }
  return transactions.filter((tx) => !tx.pending);
}

/**
 * Returns transactions for a user within a date range (both dates inclusive).
 * Filters out pending transactions by default — pending amounts may change
 * before posting and should not be used in budget or spending calculations.
 *
 * @param {string} userId - UUID of the user whose transactions to fetch.
 * @param {string} startDate - YYYY-MM-DD lower bound (inclusive).
 * @param {string} endDate - YYYY-MM-DD upper bound (inclusive).
 * @param {{ includePending?: boolean }} [options]
 * @returns {Promise<Transaction[]>}
 */
export async function getTransactionsInRange(
  userId: string,
  startDate: string,
  endDate: string,
  options?: { includePending?: boolean },
): Promise<Transaction[]> {
  const transactions = await repoGetTransactionsInRange(userId, startDate, endDate);

  if (options?.includePending) {
    return transactions;
  }
  return transactions.filter((tx) => !tx.pending);
}
