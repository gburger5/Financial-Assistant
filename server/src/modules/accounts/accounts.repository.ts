/**
 * @module accounts.repository
 * @description DynamoDB data-access layer for the Accounts module.
 * Contains no business logic — each function performs a single, named
 * database operation. Callers (the service layer) decide what to do with
 * null or empty return values.
 *
 * Accounts table schema:
 *   PK: userId (HASH), SK: plaidAccountId (RANGE)
 *   GSI: itemId-index          — itemId (HASH), plaidAccountId (RANGE)
 *        Used during sync and item deletion to find all accounts for a bank connection.
 *   GSI: plaidAccountId-index  — plaidAccountId (HASH)
 *        Used when processing transactions to look up account context.
 */
import { DeleteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db } from '../../db/index.js';
import { Tables, Indexes } from '../../db/tables.js';
import type { Account } from './accounts.types.js';

// ---------------------------------------------------------------------------
// Write functions
// ---------------------------------------------------------------------------

/**
 * Upserts an Account record in DynamoDB using an UpdateCommand.
 * All mutable fields are overwritten on every call. createdAt is written
 * with `if_not_exists` so subsequent syncs never overwrite the original
 * creation timestamp.
 *
 * Uses UpdateCommand (not PutCommand) so concurrent writes to unrelated
 * fields on the same item are not lost.
 *
 * @param {Account} account - The fully-mapped Account object to persist.
 * @returns {Promise<void>}
 */
export async function upsertAccount(account: Account): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: Tables.Accounts,
      Key: { userId: account.userId, plaidAccountId: account.plaidAccountId },
      // 'name', 'type', and 'subtype' are DynamoDB reserved words; reference via ExpressionAttributeNames.
      UpdateExpression:
        'SET #name = :name, officialName = :officialName, mask = :mask, ' +
        '#type = :type, #subtype = :subtype, itemId = :itemId, ' +
        'currentBalance = :currentBalance, availableBalance = :availableBalance, ' +
        'limitBalance = :limitBalance, isoCurrencyCode = :isoCurrencyCode, ' +
        'unofficialCurrencyCode = :unofficialCurrencyCode, updatedAt = :updatedAt, ' +
        'createdAt = if_not_exists(createdAt, :createdAt)',
      ExpressionAttributeNames: {
        '#name': 'name',
        '#type': 'type',
        '#subtype': 'subtype',
      },
      ExpressionAttributeValues: {
        ':name': account.name,
        ':officialName': account.officialName,
        ':mask': account.mask,
        ':type': account.type,
        ':subtype': account.subtype,
        ':itemId': account.itemId,
        ':currentBalance': account.currentBalance,
        ':availableBalance': account.availableBalance,
        ':limitBalance': account.limitBalance,
        ':isoCurrencyCode': account.isoCurrencyCode,
        ':unofficialCurrencyCode': account.unofficialCurrencyCode,
        ':updatedAt': account.updatedAt,
        ':createdAt': account.createdAt,
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Returns all Accounts for a user by querying the base table.
 * userId is the partition key, so no GSI is needed.
 *
 * @param {string} userId - UUID of the user whose accounts to fetch.
 * @returns {Promise<Account[]>} All accounts for the user, or an empty array.
 */
export async function getAccountsByUserId(userId: string): Promise<Account[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Accounts,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    }),
  );

  return (result.Items ?? []) as Account[];
}

/**
 * Returns all Accounts belonging to a specific bank connection (PlaidItem)
 * via the itemId-index GSI. Used during sync and item deletion.
 *
 * @param {string} itemId - Plaid item ID whose child accounts to fetch.
 * @returns {Promise<Account[]>} All accounts for the item, or an empty array.
 */
export async function getAccountsByItemId(itemId: string): Promise<Account[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Accounts,
      IndexName: Indexes.Accounts.itemIdIndex,
      KeyConditionExpression: 'itemId = :itemId',
      ExpressionAttributeValues: { ':itemId': itemId },
    }),
  );

  return (result.Items ?? []) as Account[];
}

/**
 * Finds a single Account by its Plaid account ID via the plaidAccountId-index GSI.
 * Used when processing individual transactions to look up account context.
 * Returns null rather than throwing — the service layer decides whether not-found
 * is an error condition.
 *
 * @param {string} plaidAccountId - Plaid account ID to look up.
 * @returns {Promise<Account | null>} The account, or null if not found.
 */
export async function getAccountByPlaidAccountId(
  plaidAccountId: string,
): Promise<Account | null> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Accounts,
      IndexName: Indexes.Accounts.plaidAccountIdIndex,
      KeyConditionExpression: 'plaidAccountId = :plaidAccountId',
      ExpressionAttributeValues: { ':plaidAccountId': plaidAccountId },
    }),
  );

  if (!result.Items || result.Items.length === 0) return null;
  return result.Items[0] as Account;
}

/**
 * Atomically adjusts an account's currentBalance by a delta amount.
 * Positive delta = balance increases (deposit/contribution).
 * Negative delta = balance decreases (payment out).
 *
 * Uses ADD so concurrent adjustments are safe — no read-modify-write race.
 *
 * @param {string} userId - UUID of the user who owns the account.
 * @param {string} plaidAccountId - Plaid account ID to adjust.
 * @param {number} delta - Amount to add (positive) or subtract (negative).
 * @returns {Promise<void>}
 */
export async function adjustBalance(
  userId: string,
  plaidAccountId: string,
  delta: number,
): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: Tables.Accounts,
      Key: { userId, plaidAccountId },
      UpdateExpression: 'ADD currentBalance :delta SET updatedAt = :now',
      ExpressionAttributeValues: {
        ':delta': delta,
        ':now': new Date().toISOString(),
      },
    }),
  );
}

/**
 * Deletes all Account records for a user.
 * Queries the base table by userId (HASH key) to enumerate all plaidAccountIds,
 * then batch-deletes each record. Called during account deletion to ensure
 * financial account data is not orphaned.
 *
 * @param {string} userId - UUID of the user whose accounts to delete.
 * @returns {Promise<void>}
 */
export async function deleteAllAccountsForUser(userId: string): Promise<void> {
  const accounts = await getAccountsByUserId(userId);

  await Promise.all(
    accounts.map((account) =>
      db.send(
        new DeleteCommand({
          TableName: Tables.Accounts,
          Key: { userId: account.userId, plaidAccountId: account.plaidAccountId },
        }),
      ),
    ),
  );
}
