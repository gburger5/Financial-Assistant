/**
 * @module liabilities.repository
 * @description DynamoDB data-access layer for the Liabilities module.
 * Contains no business logic — each function performs a single, named
 * database operation. Returns [] instead of throwing when records are not
 * found; the service layer decides what to do.
 *
 * Liabilities table schema:
 *   PK: userId (HASH), SK: sortKey (RANGE) — format: "plaidAccountId#ULID"
 *
 * Each sync creates a new record per liability account (append-only).
 * The ULID suffix sorts chronologically, so the latest snapshot per account
 * is the one with the highest sort key for a given plaidAccountId prefix.
 * saveSnapshot uses PutCommand — each call creates a new historical record.
 */
import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { db } from '../../db/index.js';
import { Tables } from '../../db/tables.js';
import type { Liability } from './liabilities.types.js';

/**
 * Saves a liability snapshot as a new historical record in DynamoDB.
 * The sortKey (plaidAccountId#ULID) is set by the service layer before
 * calling this function, ensuring each sync creates a distinct record.
 *
 * @param {Liability} liability - The fully-mapped liability to persist.
 * @returns {Promise<void>}
 */
export async function saveSnapshot(liability: Liability): Promise<void> {
  await db.send(
    new PutCommand({
      TableName: Tables.Liabilities,
      Item: liability,
    }),
  );
}

/**
 * Returns the most recent liability snapshot for each account belonging to a user.
 * Queries all records for the user, groups by plaidAccountId, and returns
 * only the record with the highest sortKey (latest ULID) per account.
 *
 * @param {string} userId - UUID of the user whose latest liabilities to fetch.
 * @returns {Promise<Liability[]>} Latest snapshot per account, or [] if none.
 */
export async function getLatestByUserId(userId: string): Promise<Liability[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Liabilities,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    }),
  );

  const items = (result.Items ?? []) as Liability[];

  // Group by plaidAccountId, keep only the record with the highest sortKey per account.
  // sortKey format is "plaidAccountId#ULID" — ULIDs sort chronologically as strings.
  const latestByAccount = new Map<string, Liability>();
  for (const item of items) {
    const existing = latestByAccount.get(item.plaidAccountId);
    if (!existing || item.sortKey > existing.sortKey) {
      latestByAccount.set(item.plaidAccountId, item);
    }
  }

  return Array.from(latestByAccount.values());
}

/**
 * Returns all liability snapshots (full history) for a user.
 * Includes every historical record, not just the latest per account.
 * Useful for tracking how liabilities change over time.
 *
 * @param {string} userId - UUID of the user whose liability history to fetch.
 * @returns {Promise<Liability[]>} All snapshots for the user, or [] if none.
 */
export async function getAllByUserId(userId: string): Promise<Liability[]> {
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
  const liabilities = await getAllByUserId(userId);

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
