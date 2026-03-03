/**
 * @module items.service
 * @description Business logic layer for the PlaidItems module.
 * Controllers and other services import from here — never from the
 * repository directly. This layer translates repository nulls into
 * typed errors and handles encryption/decryption of access tokens.
 *
 * Encryption: Plaid access tokens are stored encrypted at rest using
 * AES-256-GCM via src/lib/encryption.ts. Decryption happens here, in
 * the service — the repository only ever sees ciphertext.
 */
import { decrypt } from '../../lib/encryption.js';
import {
  saveItem,
  getItemsByUserId,
  getItemByItemId,
  updateTransactionCursor,
  markItemBad,
  markItemActive,
} from './items.repository.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import type { PlaidItem, CreatePlaidItemInput } from './items.types.js';

/** PlaidItem with encryptedAccessToken replaced by the plain accessToken. */
type PlaidItemWithToken = Omit<PlaidItem, 'encryptedAccessToken'> & { accessToken: string };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Strips encryptedAccessToken from a PlaidItem and returns it with a
 * decrypted, plain accessToken in its place.
 *
 * @param {PlaidItem} item - The item whose token to decrypt.
 * @returns {PlaidItemWithToken}
 */
function decryptItem(item: PlaidItem): PlaidItemWithToken {
  const { encryptedAccessToken, ...rest } = item;
  return { ...rest, accessToken: decrypt(encryptedAccessToken) };
}

// ---------------------------------------------------------------------------
// Public service methods
// ---------------------------------------------------------------------------

/**
 * Links a new bank connection by persisting the PlaidItem record.
 * Called by plaid.service after a successful public_token → access_token exchange.
 *
 * @param {CreatePlaidItemInput} input - Item data from the token exchange.
 * @returns {Promise<PlaidItem>} The saved item.
 * @throws {ConflictError} If the itemId is already linked (DynamoDB condition failed).
 */
export async function linkItem(input: CreatePlaidItemInput): Promise<PlaidItem> {
  const saved = await saveItem(input);
  if (saved === null) {
    throw new ConflictError('Item already linked');
  }
  return saved;
}

/**
 * Returns all PlaidItems for a user with decrypted access tokens.
 * Server-side only — never send these objects to the client.
 *
 * @param {string} userId - UUID of the user whose items to load.
 * @returns {Promise<PlaidItemWithToken[]>}
 */
export async function getItemsForUser(userId: string): Promise<PlaidItemWithToken[]> {
  const items = await getItemsByUserId(userId);
  return items.map(decryptItem);
}

/**
 * Loads a single PlaidItem by itemId and returns it with a decrypted access
 * token. Used by every sync function and webhook handler that needs to call
 * the Plaid API.
 *
 * Not finding the item is always an error — there is no valid case where a
 * sync or webhook fires for an item that is not in the database.
 *
 * @param {string} itemId - Plaid item ID to fetch.
 * @returns {Promise<PlaidItemWithToken>} The item with a plain accessToken.
 * @throws {NotFoundError} If the item does not exist in the database.
 */
export async function getItemForSync(itemId: string): Promise<PlaidItemWithToken> {
  const item = await getItemByItemId(itemId);
  if (item === null) {
    throw new NotFoundError(`PlaidItem not found: ${itemId}`);
  }
  return decryptItem(item);
}

/**
 * Persists the latest transaction sync cursor after a successful sync loop.
 * Allows incremental syncs to resume from where they left off.
 *
 * @param {string} itemId - Plaid item ID.
 * @param {string} cursor - New cursor string from Plaid's /transactions/sync response.
 * @returns {Promise<void>}
 */
export async function updateCursor(itemId: string, cursor: string): Promise<void> {
  await updateTransactionCursor(itemId, cursor);
}

/**
 * Marks an item as 'bad' when Plaid fires an ITEM_LOGIN_REQUIRED webhook.
 * The item remains in the database but sync functions should not use it
 * until the user re-authenticates and restoreItem is called.
 *
 * @param {string} itemId - Plaid item ID of the item that lost access.
 * @returns {Promise<void>}
 */
export async function handleLoginRequired(itemId: string): Promise<void> {
  await markItemBad(itemId);
}

/**
 * Restores an item to 'active' status after a user successfully
 * re-authenticates through Plaid Link update mode.
 *
 * @param {string} itemId - Plaid item ID of the item to restore.
 * @returns {Promise<void>}
 */
export async function restoreItem(itemId: string): Promise<void> {
  await markItemActive(itemId);
}
