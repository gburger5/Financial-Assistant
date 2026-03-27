/**
 * @module transactions.repository
 * @description DynamoDB data-access layer for the Transactions module.
 * Contains no business logic — each function performs a single, named
 * database operation. Returns null or [] instead of throwing when records
 * are not found; the service layer decides what to do.
 *
 * Transactions table schema:
 *   PK: userId (HASH), SK: sortKey (RANGE) — sortKey is "date#plaidTransactionId"
 *   GSI: plaidTransactionId-index — plaidTransactionId (HASH)
 *        Used for upserts and deletes triggered by Plaid data where only
 *        the transaction ID is known.
 *   GSI: accountId-date-index
 *
 * Reserved-word note:
 *   "date" and "name" are reserved words in DynamoDB's expression syntax.
 *   They are always aliased as #date and #name in ExpressionAttributeNames.
 *   Omitting these aliases causes a silent validation error at runtime.
 */
import { DeleteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db } from '../../db/index.js';
import { Indexes, Tables } from '../../db/tables.js';
import type { Transaction } from './transactions.types.js';

// ---------------------------------------------------------------------------
// Write functions
// ---------------------------------------------------------------------------

/**
 * Upserts a Transaction in DynamoDB using UpdateCommand.
 * All mutable fields are overwritten on every call. createdAt is written
 * with `if_not_exists` so the original creation timestamp is never clobbered
 * by subsequent Plaid syncs that re-deliver the same transaction.
 *
 * "date" and "name" are DynamoDB reserved words and must be aliased via
 * ExpressionAttributeNames (#date, #name) in every expression that references them.
 *
 * @param {Transaction} transaction - The fully-mapped Transaction to persist.
 * @returns {Promise<void>}
 */
export async function upsertTransaction(transaction: Transaction): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: Tables.Transactions,
      Key: { userId: transaction.userId, sortKey: transaction.sortKey },
      // "date" and "name" are DynamoDB reserved words — alias them via ExpressionAttributeNames.
      UpdateExpression:
        'SET plaidTransactionId = :plaidTransactionId, ' +
        'plaidAccountId = :plaidAccountId, ' +
        'amount = :amount, ' +
        '#date = :date, ' +
        '#name = :name, ' +
        'merchantName = :merchantName, ' +
        'category = :category, ' +
        'detailedCategory = :detailedCategory, ' +
        'categoryIconUrl = :categoryIconUrl, ' +
        'pending = :pending, ' +
        'isoCurrencyCode = :isoCurrencyCode, ' +
        'unofficialCurrencyCode = :unofficialCurrencyCode, ' +
        'updatedAt = :updatedAt, ' +
        'createdAt = if_not_exists(createdAt, :createdAt)',
      ExpressionAttributeNames: {
        '#date': 'date',
        '#name': 'name',
      },
      ExpressionAttributeValues: {
        ':plaidTransactionId': transaction.plaidTransactionId,
        ':plaidAccountId': transaction.plaidAccountId,
        ':amount': transaction.amount,
        ':date': transaction.date,
        ':name': transaction.name,
        ':merchantName': transaction.merchantName,
        ':category': transaction.category,
        ':detailedCategory': transaction.detailedCategory,
        ':categoryIconUrl': transaction.categoryIconUrl,
        ':pending': transaction.pending,
        ':isoCurrencyCode': transaction.isoCurrencyCode,
        ':unofficialCurrencyCode': transaction.unofficialCurrencyCode,
        ':updatedAt': transaction.updatedAt,
        ':createdAt': transaction.createdAt,
      },
    }),
  );
}

/**
 * Deletes a transaction by its Plaid transaction ID.
 * Two-step operation: the GSI holds only the plaidTransactionId as a hash key,
 * so we must first project the full primary key (userId + sortKey) from the
 * GSI, then issue the DeleteCommand with that key.
 *
 * If the GSI returns no results the transaction was never stored; returns early
 * silently because there is nothing to delete.
 *
 * @param {string} plaidTransactionId - Plaid transaction ID to delete.
 * @returns {Promise<void>}
 */
export async function deleteByPlaidTransactionId(plaidTransactionId: string): Promise<void> {
  // Step 1: Resolve userId and sortKey from the GSI.
  // ProjectionExpression avoids deserializing the full item — we only need the primary key.
  const queryResult = await db.send(
    new QueryCommand({
      TableName: Tables.Transactions,
      IndexName: Indexes.Transactions.plaidTransactionIdIndex,
      KeyConditionExpression: 'plaidTransactionId = :plaidTransactionId',
      ExpressionAttributeValues: { ':plaidTransactionId': plaidTransactionId },
      ProjectionExpression: 'userId, sortKey',
    }),
  );

  if (!queryResult.Items || queryResult.Items.length === 0) {
    // Transaction was never stored — nothing to delete.
    return;
  }

  const { userId, sortKey } = queryResult.Items[0] as { userId: string; sortKey: string };

  // Step 2: Delete using the full composite primary key.
  await db.send(
    new DeleteCommand({
      TableName: Tables.Transactions,
      Key: { userId, sortKey },
    }),
  );
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Returns all transactions for a user on or after sinceDate.
 * Uses a BETWEEN key condition on the sort key. The upper bound
 * "9999-12-31#~" captures the entire future — ISO dates sort correctly
 * as plain strings, and "~" has a high ASCII value that sorts after any
 * plaidTransactionId suffix.
 *
 * @param {string} userId - UUID of the user whose transactions to fetch.
 * @param {string} sinceDate - YYYY-MM-DD lower bound (inclusive).
 * @returns {Promise<Transaction[]>} Matching transactions, or [] if none found.
 */
export async function getTransactionsSince(
  userId: string,
  sinceDate: string,
): Promise<Transaction[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Transactions,
      KeyConditionExpression: 'userId = :userId AND sortKey BETWEEN :sinceDate AND :endRange',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':sinceDate': sinceDate,
        ':endRange': '9999-12-31#~',
      },
    }),
  );

  return (result.Items ?? []) as Transaction[];
}

/**
 * Returns all transactions for a user within a date range (inclusive on both ends).
 * The upper bound is endDate + "#~" so the full end date is captured — a plain
 * endDate would exclude any transaction whose sortKey is "endDate#<id>" because
 * "endDate#" > "endDate" alphabetically.
 *
 * @param {string} userId - UUID of the user whose transactions to fetch.
 * @param {string} startDate - YYYY-MM-DD lower bound (inclusive).
 * @param {string} endDate - YYYY-MM-DD upper bound (inclusive).
 * @returns {Promise<Transaction[]>} Matching transactions, or [] if none found.
 */
export async function getTransactionsInRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<Transaction[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Transactions,
      KeyConditionExpression: 'userId = :userId AND sortKey BETWEEN :startDate AND :endRange',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':startDate': startDate,
        ':endRange': `${endDate}#~`,
      },
    }),
  );

  return (result.Items ?? []) as Transaction[];
}

/**
 * Deletes all Transaction records for a user.
 * Queries the base table by userId (HASH key) projecting only sortKey,
 * then batch-deletes each record. Called during account deletion to ensure
 * transaction history is not orphaned.
 *
 * @param {string} userId - UUID of the user whose transactions to delete.
 * @returns {Promise<void>}
 */
export async function deleteAllTransactionsForUser(userId: string): Promise<void> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Transactions,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      // Project only the keys to avoid deserializing large transaction items.
      ProjectionExpression: 'userId, sortKey',
    }),
  );

  const items = result.Items ?? [];
  await Promise.all(
    items.map((item) =>
      db.send(
        new DeleteCommand({
          TableName: Tables.Transactions,
          Key: { userId: item.userId, sortKey: item.sortKey },
        }),
      ),
    ),
  );
}
