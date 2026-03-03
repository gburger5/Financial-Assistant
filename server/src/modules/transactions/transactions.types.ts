export interface Transaction {
  userId: string;
  sortKey: string;               // date#plaidTransactionId — enables date range queries
  plaidTransactionId: string;
  plaidAccountId: string;
  amount: number;                // Plaid convention: positive = money out, negative = money in
  date: string;                  // YYYY-MM-DD — the posted date
  name: string;                  // transaction description from institution
  merchantName: string | null;
  category: string | null;
  detailedCategory: string | null;
  categoryIconUrl: string | null;
  pending: boolean;
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name: string | null;
  personal_finance_category: {
    primary: string;
    detailed: string;
    icon_url: string;
  } | null;
  pending: boolean;
  iso_currency_code: string | null;
  unofficial_currency_code: string | null;
}

export interface SyncResult {
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
  nextCursor: string;
  /** True if the item has at least one depository or credit account.
   *  Investment-only institutions (e.g. Vanguard) will never have transaction
   *  data — callers use this flag to skip polling for transactions. */
  hasTransactionCapableAccounts: boolean;
  /** True when Plaid's transactions_update_status is NOT_READY — data has not
   *  been processed yet. The cursor should not be committed and callers should
   *  retry after a delay. */
  notReady: boolean;
}
