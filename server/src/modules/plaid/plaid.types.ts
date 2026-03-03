/**
 * @module plaid.types
 * @description Shared type definitions for the Plaid orchestration module.
 * These types describe the HTTP boundary with Plaid — webhook payloads,
 * request bodies for link token / token exchange, and the result shapes
 * returned to the client.
 */

/**
 * Body for GET /api/plaid/link-token.
 * No fields — the userId comes from the authenticated JWT, not the request body.
 */
export type CreateLinkTokenBody = Record<string, never>;

/**
 * Body for POST /api/plaid/exchange-token.
 * Sent by the client after the user completes the Plaid Link flow.
 */
export interface ExchangePublicTokenBody {
  publicToken: string;
  institutionId: string;
  institutionName: string;
}

/**
 * Shape of the JSON body Plaid POSTs to our /api/plaid/webhook endpoint.
 * additionalProperties is intentionally not enforced here — Plaid adds new
 * fields frequently and discarding them would lose log-useful data.
 */
export interface PlaidWebhookBody {
  webhook_type: WebhookType;
  webhook_code: string;
  item_id: string;
  error: PlaidWebhookError | null;
  new_transactions?: number;
  historical_update_complete?: boolean;
}

/**
 * All webhook_type values that Plaid may send.
 * Any new types introduced by Plaid will not match this union and will be
 * logged and silently ignored by the webhook handler.
 */
export type WebhookType =
  | 'TRANSACTIONS'
  | 'INVESTMENTS_TRANSACTIONS'
  | 'HOLDINGS'
  | 'ITEM'
  | 'AUTH'
  | 'LIABILITIES';

/**
 * Plaid error object nested inside webhook payloads.
 * Only present when the webhook describes an error condition.
 */
export interface PlaidWebhookError {
  error_type: string;
  error_code: string;
  error_message: string;
  display_message: string | null;
}

/**
 * Value returned to the client after a successful POST /api/plaid/exchange-token.
 * The itemId lets the client associate the new bank connection with subsequent
 * API calls without needing to fetch the item list.
 */
export interface LinkBankAccountResult {
  message: string;
  itemId: string;
}

/**
 * Response shape for GET /api/plaid/sync-status.
 * The client polls this after linking a bank account until ready === true,
 * then calls POST /budget/initialize. ready is true when every active item
 * has had syncTransactions run at least once (transactionCursor !== null),
 * including items where the transactions product is not supported (cursor set
 * to "" in the ITEM_ERROR catch path).
 */
export interface SyncStatus {
  /** Total number of active items linked by the user. */
  itemsLinked: number;
  /** Number of active items that have completed their first sync (cursor !== null). */
  itemsSynced: number;
  /** True when itemsLinked > 0 and itemsSynced === itemsLinked. */
  ready: boolean;
}
