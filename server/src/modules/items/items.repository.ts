/**
 * @module items.repository
 * @description DynamoDB data-access layer for the PlaidItems module.
 * Contains no business logic — each function performs a single, named
 * database operation. Callers (the service layer) decide what to do with
 * null return values.
 *
 * Table: PlaidItems
 *   PK: userId (HASH)
 *   SK: itemId (RANGE)
 *   GSI: itemId-index — itemId (HASH) — used for webhook lookups where
 *        only itemId is known.
 *
 * Update methods (updateTransactionCursor, markItemBad, markItemActive)
 * accept only itemId and must resolve userId via the GSI before issuing
 * an UpdateCommand against the full composite key.
 */
import { QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db } from '../../db/index.js';
import { Tables, Indexes } from '../../db/tables.js';
import type { PlaidItem, CreatePlaidItemInput } from './items.types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the full composite key { userId, itemId } for a given itemId by
 * querying the itemId-index GSI. Required before any UpdateCommand because
 * DynamoDB UpdateCommand requires the complete primary key of the base table.
 *
 * Returns null if the item is not found — callers decide whether that is
 * an error condition.
 *
 * @param {string} itemId - Plaid item ID to look up.
 * @returns {Promise<{ userId: string; itemId: string } | null>}
 */
async function resolveCompositeKey(
  itemId: string,
): Promise<{ userId: string; itemId: string } | null> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.PlaidItems,
      IndexName: Indexes.PlaidItems.itemIdIndex,
      KeyConditionExpression: 'itemId = :itemId',
      ExpressionAttributeValues: { ':itemId': itemId },
    }),
  );

  if (!result.Items || result.Items.length === 0) return null;
  const item = result.Items[0] as PlaidItem;
  return { userId: item.userId, itemId: item.itemId };
}

// ---------------------------------------------------------------------------
// Write functions
// ---------------------------------------------------------------------------

/**
 * Persists a new PlaidItem document to DynamoDB.
 *
 * Uses `attribute_not_exists(itemId)` as a ConditionExpression so that
 * two concurrent link attempts for the same itemId cannot both succeed —
 * DynamoDB will reject the second one atomically with a
 * ConditionalCheckFailedException.
 *
 * @param {CreatePlaidItemInput} input - Caller-supplied fields from the token exchange.
 * @returns {Promise<PlaidItem | null>} The saved item, or null if itemId already exists.
 */
export async function saveItem(input: CreatePlaidItemInput): Promise<PlaidItem | null> {
  const now = new Date().toISOString();

  const item: PlaidItem = {
    userId: input.userId,
    itemId: input.itemId,
    encryptedAccessToken: input.encryptedAccessToken,
    institutionId: input.institutionId,
    institutionName: input.institutionName,
    status: 'active',
    transactionCursor: null,
    consentExpirationTime: input.consentExpirationTime ?? null,
    linkedAt: now,
    updatedAt: now,
  };

  try {
    await db.send(
      new PutCommand({
        TableName: Tables.PlaidItems,
        Item: item,
        // Prevent duplicate itemId entries atomically.
        ConditionExpression: 'attribute_not_exists(itemId)',
      }),
    );
  } catch (err) {
    if ((err as Error).name === 'ConditionalCheckFailedException') {
      // The itemId already exists — the service translates this to a 409.
      return null;
    }
    throw err;
  }

  return item;
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Returns all PlaidItems for a user.
 * Queries the base table directly since userId is the partition key.
 *
 * @param {string} userId - UUID of the user whose items to fetch.
 * @returns {Promise<PlaidItem[]>} All items for the user, or an empty array.
 */
export async function getItemsByUserId(userId: string): Promise<PlaidItem[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.PlaidItems,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    }),
  );

  return (result.Items ?? []) as PlaidItem[];
}

/**
 * Finds a single PlaidItem by its Plaid itemId via the itemId-index GSI.
 * Used when a webhook arrives with an itemId but no userId.
 *
 * @param {string} itemId - Plaid item ID to look up.
 * @returns {Promise<PlaidItem | null>} The item, or null if not found.
 */
export async function getItemByItemId(itemId: string): Promise<PlaidItem | null> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.PlaidItems,
      IndexName: Indexes.PlaidItems.itemIdIndex,
      KeyConditionExpression: 'itemId = :itemId',
      ExpressionAttributeValues: { ':itemId': itemId },
    }),
  );

  if (!result.Items || result.Items.length === 0) return null;
  return result.Items[0] as PlaidItem;
}

// ---------------------------------------------------------------------------
// Targeted update functions
// ---------------------------------------------------------------------------

/**
 * Updates the transaction cursor for an item after a successful sync loop.
 * Also bumps updatedAt. Does not touch any other fields.
 *
 * Resolves the full composite key via the itemId-index GSI first, since
 * DynamoDB UpdateCommand requires both userId (HASH) and itemId (RANGE).
 *
 * @param {string} itemId - Plaid item ID of the item to update.
 * @param {string} cursor - New transaction cursor from Plaid.
 * @returns {Promise<void>}
 */
export async function updateTransactionCursor(itemId: string, cursor: string): Promise<void> {
  const key = await resolveCompositeKey(itemId);
  if (!key) return;

  await db.send(
    new UpdateCommand({
      TableName: Tables.PlaidItems,
      Key: key,
      UpdateExpression: 'SET transactionCursor = :cursor, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':cursor': cursor,
        ':updatedAt': new Date().toISOString(),
      },
    }),
  );
}

/**
 * Marks an item as 'bad' when Plaid fires an ITEM_LOGIN_REQUIRED webhook.
 * Also bumps updatedAt. Does not touch any other fields.
 *
 * @param {string} itemId - Plaid item ID of the item to mark bad.
 * @returns {Promise<void>}
 */
export async function markItemBad(itemId: string): Promise<void> {
  const key = await resolveCompositeKey(itemId);
  if (!key) return;

  await db.send(
    new UpdateCommand({
      TableName: Tables.PlaidItems,
      Key: key,
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      // 'status' is a reserved word in DynamoDB expression syntax.
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'bad',
        ':updatedAt': new Date().toISOString(),
      },
    }),
  );
}

/**
 * Restores an item to 'active' after a user successfully re-authenticates.
 * Also bumps updatedAt. Does not touch any other fields.
 *
 * @param {string} itemId - Plaid item ID of the item to restore.
 * @returns {Promise<void>}
 */
export async function markItemActive(itemId: string): Promise<void> {
  const key = await resolveCompositeKey(itemId);
  if (!key) return;

  await db.send(
    new UpdateCommand({
      TableName: Tables.PlaidItems,
      Key: key,
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      // 'status' is a reserved word in DynamoDB expression syntax.
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'active',
        ':updatedAt': new Date().toISOString(),
      },
    }),
  );
}
