/**
 * @module liabilities.repository
 * @description DynamoDB data-access layer for the Liabilities module.
 * Contains no business logic — each function performs a single, named
 * database operation. Returns [] instead of throwing when records are not
 * found; the service layer decides what to do.
 *
 * Liabilities table schema:
 *   PK: userId (HASH), SK: plaidAccountId (RANGE)
 *
 * Key design distinction from every other repository in this codebase:
 *   upsertSnapshot uses PutCommand (full overwrite), not UpdateCommand.
 *   Liabilities are current-state snapshots — what you owe right now.
 *   There is no analytical value in preserving previous field values, so
 *   no ConditionExpression and no if_not_exists pattern. The entire record
 *   is always replaced. This is intentionally different from transactions
 *   and holdings which use UpdateCommand + if_not_exists(createdAt).
 */
import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { db } from '../../db/index.js';
import { Tables } from '../../db/tables.js';
import type { Liability } from './liabilities.types.js';

/**
 * Upserts a single liability record in DynamoDB using PutCommand.
 * The entire item is replaced on every call — no ConditionExpression,
 * no field-level preservation. Current state is the only state that matters
 * for financial planning; stale field values have no analytical purpose.
 *
 * @param {Liability} liability - The fully-mapped liability to persist.
 * @returns {Promise<void>}
 */
export async function upsertSnapshot(liability: Liability): Promise<void> {
  await db.send(
    new PutCommand({
      TableName: Tables.Liabilities,
      Item: liability,
    }),
  );
}

/**
 * Returns all liabilities for a user across all types (credit, student, mortgage).
 * The caller filters by type in memory — a user has at most a handful of
 * liability accounts, so in-memory filtering is negligible compared to the
 * write overhead a GSI on liabilityType would add.
 *
 * @param {string} userId - UUID of the user whose liabilities to fetch.
 * @returns {Promise<Liability[]>} All liabilities for the user, or [] if none.
 */
export async function getByUserId(userId: string): Promise<Liability[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Liabilities,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    }),
  );

  return (result.Items ?? []) as Liability[];
}

/**
 * Deletes all Liability records for a user.
 * Queries the base table by userId (HASH key) to enumerate all plaidAccountIds,
 * then batch-deletes each record. Called during account deletion to ensure
 * liability snapshots are not orphaned.
 *
 * @param {string} userId - UUID of the user whose liabilities to delete.
 * @returns {Promise<void>}
 */
export async function deleteAllLiabilitiesForUser(userId: string): Promise<void> {
  const liabilities = await getByUserId(userId);

  await Promise.all(
    liabilities.map((liability) =>
      db.send(
        new DeleteCommand({
          TableName: Tables.Liabilities,
          Key: { userId: liability.userId, plaidAccountId: liability.plaidAccountId },
        }),
      ),
    ),
  );
}
