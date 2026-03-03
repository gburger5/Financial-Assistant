/**
 * @module items.types
 * @description Shared type definitions for the PlaidItems module.
 * PlaidItem is the central data model connecting a Plaid itemId to a userId
 * and storing the encrypted access token used to pull that bank's data.
 */

/**
 * Full document shape stored in DynamoDB for every linked bank connection.
 * One PlaidItem represents one institution linked via Plaid Link.
 *
 * Status lifecycle:
 *   'active' — token is valid; sync functions can use it.
 *   'bad'    — ITEM_LOGIN_REQUIRED webhook fired; user must re-authenticate.
 */
export interface PlaidItem {
  /** UUID of the user who linked this item. Partition key. */
  userId: string;
  /** Plaid-assigned item identifier. Sort key and GSI hash key. */
  itemId: string;
  /** AES-256-GCM encrypted Plaid access token. Never returned to clients. */
  encryptedAccessToken: string;
  /** Plaid institution ID (e.g. "ins_3"). */
  institutionId: string;
  /** Human-readable institution name (e.g. "Chase"). */
  institutionName: string;
  /** 'active' when usable; 'bad' when ITEM_LOGIN_REQUIRED has fired. */
  status: 'active' | 'bad';
  /**
   * Plaid transaction sync cursor. null until the first sync completes.
   * Stored so each incremental sync picks up where the last one left off.
   */
  transactionCursor: string | null;
  /** ISO timestamp when Plaid consent expires, or null if not applicable. */
  consentExpirationTime: string | null;
  /** ISO timestamp when the item was first linked. */
  linkedAt: string;
  /** ISO timestamp of the most recent field update. */
  updatedAt: string;
}

/**
 * Input shape for creating a new PlaidItem record.
 * Callers supply the Plaid-returned fields; the repository fills in
 * status, timestamps, and cursor defaults.
 */
export interface CreatePlaidItemInput {
  userId: string;
  itemId: string;
  encryptedAccessToken: string;
  institutionId: string;
  institutionName: string;
  /** Plaid consent expiration time, if provided by the token exchange response. */
  consentExpirationTime?: string | null;
}
