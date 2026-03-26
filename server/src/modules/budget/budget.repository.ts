/**
 * @module budget.repository
 * @description DynamoDB persistence layer for the Budget module.
 *
 * DynamoDB schema:
 *   Table: Budgets
 *   PK: userId (HASH)
 *   SK: budgetId (RANGE) — a ULID, so lexicographic order = chronological order
 *
 * Every save creates a new record via PutCommand — no UpdateCommand is used.
 * This preserves full budget history; the latest budget is always the item
 * with the lexicographically largest budgetId.
 */
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { db } from '../../db/index.js';
import { Tables } from '../../db/tables.js';
import { BadRequestError } from '../../lib/errors.js';
import type { Budget } from './budget.types.js';

/**
 * Persists a budget snapshot.
 * Always inserts a new record — never updates an existing one.
 * The ULID budgetId guarantees uniqueness and natural chronological order.
 * Rejects budgets with an empty goals array as a safety net — the service
 * layer validates this too, but the repository enforces it as a last line
 * of defence so no code path can persist a goalless budget.
 *
 * @param {Budget} budget - The budget snapshot to store.
 * @returns {Promise<void>}
 * @throws {BadRequestError} If the budget has no goals.
 */
export async function saveBudget(budget: Budget): Promise<void> {
  if (!budget.goals || budget.goals.length === 0) {
    throw new BadRequestError('Budget must have at least one goal');
  }

  await db.send(
    new PutCommand({
      TableName: Tables.Budgets,
      Item: budget,
    }),
  );
}

/**
 * Retrieves the most recent budget for a user.
 * Uses ScanIndexForward: false with Limit: 1 so DynamoDB returns the item
 * with the highest (most recent) ULID sort key in a single read.
 *
 * @param {string} userId
 * @returns {Promise<Budget | null>} The latest budget, or null if none exists.
 */
export async function getLatestBudget(userId: string): Promise<Budget | null> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Budgets,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );

  const items = result.Items;
  if (!items || items.length === 0) return null;
  return items[0] as Budget;
}

/**
 * Retrieves the full budget history for a user, newest first.
 * No Limit is applied — all versions are returned to support the history view.
 *
 * @param {string} userId
 * @returns {Promise<Budget[]>} All budget snapshots in reverse chronological order.
 */
export async function getBudgetHistory(userId: string): Promise<Budget[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Budgets,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ScanIndexForward: false,
    }),
  );

  return (result.Items ?? []) as Budget[];
}
