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
 */
import { createLogger } from '../../lib/logger.js';
import { plaidClient } from '../../lib/plaidClient.js';
import { getItemForSync, updateCursor } from '../items/items.service.js';
import { syncAccounts } from '../accounts/accounts.service.js';
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
 * @param {string} userId - UUID of the user who owns the bank connection.
 * @param {string} itemId - Plaid item ID of the bank connection to sync.
 * @returns {Promise<SyncResult>} Counts of Plaid-returned items per operation
 *   (not counts of successful DB writes) plus the committed cursor.
 */
export async function syncTransactions(userId: string, itemId: string): Promise<SyncResult> {
  const item = await getItemForSync(itemId);

  let cursor: string | undefined = item.transactionCursor ?? undefined;
  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;
  let nextCursor = cursor ?? '';

  let hasMore = true;
  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: item.accessToken,
      // Undefined cursor triggers a full-history sync on first call.
      cursor,
      options: { include_personal_finance_category: true },
    });

    const page = response.data;

    // Sync account balances on every page — balances may change mid-sync
    // on long multi-page pulls and should be kept fresh throughout.
    await syncAccounts(userId, itemId, page.accounts);

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
  await updateCursor(itemId, nextCursor);

  return { addedCount, modifiedCount, removedCount, nextCursor };
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
