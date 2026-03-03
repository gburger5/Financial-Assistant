/**
 * @module accounts.service
 * @description Business logic layer for the Accounts module.
 * All other modules import from here — never from the repository directly.
 * This layer maps raw Plaid API shapes to our storage model, normalizes
 * types, and translates repository nulls into typed errors.
 *
 * This module has no HTTP routes — it is internal only, called by
 * plaid.service after every Plaid data fetch.
 */
import {
  upsertAccount,
  getAccountsByUserId,
  getAccountsByItemId,
  getAccountByPlaidAccountId as repoGetAccountByPlaidAccountId,
} from './accounts.repository.js';
import { NotFoundError } from '../../lib/errors.js';
import type { Account, AccountType, PlaidAccountData } from './accounts.types.js';

// ---------------------------------------------------------------------------
// Pure helper functions
// ---------------------------------------------------------------------------

/**
 * Maps a raw Plaid account type string to our AccountType union.
 * Plaid may introduce new types in the future; anything not in our known
 * set falls through to 'other' so we never store an invalid type.
 *
 * @param {string} type - Raw type string from the Plaid API response.
 * @returns {AccountType}
 */
export function normalizeAccountType(type: string): AccountType {
  const known: AccountType[] = ['depository', 'credit', 'loan', 'investment', 'payroll', 'other'];
  return known.includes(type as AccountType) ? (type as AccountType) : 'other';
}

/**
 * Maps a single Plaid API account shape to our Account storage shape.
 * Pure function — no database calls, no side effects.
 * Sets both updatedAt and createdAt to the current ISO timestamp; the
 * repository uses if_not_exists on createdAt so the original value is
 * preserved on subsequent upserts.
 *
 * @param {string} userId - UUID of the user who owns this account.
 * @param {string} itemId - Plaid item ID of the parent bank connection.
 * @param {PlaidAccountData} plaidAccount - Raw account object from Plaid.
 * @returns {Account}
 */
export function mapPlaidAccount(
  userId: string,
  itemId: string,
  plaidAccount: PlaidAccountData,
): Account {
  const now = new Date().toISOString();

  return {
    userId,
    itemId,
    plaidAccountId: plaidAccount.account_id,
    name: plaidAccount.name,
    officialName: plaidAccount.official_name,
    mask: plaidAccount.mask,
    type: normalizeAccountType(plaidAccount.type),
    subtype: plaidAccount.subtype,
    currentBalance: plaidAccount.balances.current,
    availableBalance: plaidAccount.balances.available,
    limitBalance: plaidAccount.balances.limit,
    isoCurrencyCode: plaidAccount.balances.iso_currency_code,
    unofficialCurrencyCode: plaidAccount.balances.unofficial_currency_code,
    updatedAt: now,
    createdAt: now,
  };
}

// ---------------------------------------------------------------------------
// Public service methods
// ---------------------------------------------------------------------------

/**
 * Syncs all accounts returned by a Plaid data fetch into DynamoDB.
 * Called after every Plaid API call that returns account data.
 * Maps each PlaidAccountData to an Account, then upserts all of them.
 * Returns nothing — callers only need the sync to complete.
 *
 * @param {string} userId - UUID of the user who owns the bank connection.
 * @param {string} itemId - Plaid item ID of the bank connection being synced.
 * @param {PlaidAccountData[]} plaidAccounts - Raw accounts from the Plaid response.
 * @returns {Promise<void>}
 */
export async function syncAccounts(
  userId: string,
  itemId: string,
  plaidAccounts: PlaidAccountData[],
): Promise<void> {
  for (const plaidAccount of plaidAccounts) {
    const account = mapPlaidAccount(userId, itemId, plaidAccount);
    await upsertAccount(account);
  }
}

/**
 * Returns all accounts for a user.
 *
 * @param {string} userId - UUID of the user whose accounts to fetch.
 * @returns {Promise<Account[]>}
 */
export async function getAccountsForUser(userId: string): Promise<Account[]> {
  return getAccountsByUserId(userId);
}

/**
 * Returns all accounts belonging to a specific bank connection (PlaidItem).
 * Used during sync and item deletion to enumerate child records.
 *
 * @param {string} itemId - Plaid item ID whose child accounts to fetch.
 * @returns {Promise<Account[]>}
 */
export async function getAccountsForItem(itemId: string): Promise<Account[]> {
  return getAccountsByItemId(itemId);
}

/**
 * Looks up a single account by its Plaid account ID.
 * Used by the transactions module when processing individual transactions.
 * Not finding the account is always an error — there is no valid case where
 * a transaction references an account that is not in our database.
 *
 * @param {string} plaidAccountId - Plaid account ID to look up.
 * @returns {Promise<Account>}
 * @throws {NotFoundError} If the account does not exist.
 */
export async function getAccountByPlaidAccountId(plaidAccountId: string): Promise<Account> {
  const account = await repoGetAccountByPlaidAccountId(plaidAccountId);
  if (account === null) {
    throw new NotFoundError(`Account not found: ${plaidAccountId}`);
  }
  return account;
}
