/**
 * @module investments.types
 * @description Shared TypeScript interfaces and union types for the Investments module.
 * Covers both investment transactions (buy/sell/dividend events) and holdings
 * (point-in-time position snapshots), plus the raw Plaid API shapes and the
 * sync result envelope returned by updateInvestments.
 */

/** Known investment transaction types from Plaid's investmentsTransactionsGet. */
export type InvestmentTransactionType =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'transfer'
  | 'cash'
  | 'fee';

/** Known security types from Plaid's securities array. */
export type SecurityType =
  | 'cash'
  | 'cryptocurrency'
  | 'derivative'
  | 'equity'
  | 'etf'
  | 'fixed income'
  | 'loan'
  | 'mutual fund'
  | 'other';

/**
 * @interface InvestmentTransaction
 * @description A single investment transaction event (buy, sell, dividend, etc.)
 * stored in the InvestmentTransactions DynamoDB table.
 *
 * DynamoDB schema:
 *   PK: userId (HASH)
 *   SK: dateTransactionId (RANGE) — "date#investment_transaction_id"
 *   GSI: plaidInvestmentTransactionId-index
 */
export interface InvestmentTransaction {
  userId: string;
  dateTransactionId: string;           // "date#investment_transaction_id"
  investmentTransactionId: string;
  plaidAccountId: string;
  securityId: string;
  date: string;                        // YYYY-MM-DD
  name: string;
  quantity: number;
  amount: number;
  price: number;
  fees: number | null;
  type: InvestmentTransactionType;
  subtype: string | null;
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * @interface Holding
 * @description A single position in a point-in-time holdings snapshot.
 * Security metadata is inlined at sync time so stored records are self-contained.
 *
 * DynamoDB schema:
 *   PK: userId (HASH)
 *   SK: snapshotDateAccountSecurity (RANGE) — "snapshotDate#accountId#securityId"
 *   GSI: plaidAccountId-index
 */
export interface Holding {
  userId: string;
  snapshotDateAccountSecurity: string;  // "snapshotDate#accountId#securityId"
  plaidAccountId: string;
  securityId: string;
  snapshotDate: string;                 // YYYY-MM-DD
  quantity: number;
  institutionPrice: number;
  institutionValue: number;
  costBasis: number | null;
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
  // Inlined from PlaidSecurity at sync time — avoids joins at read time
  securityName: string | null;
  tickerSymbol: string | null;
  securityType: SecurityType;
  closePrice: number | null;
  closePriceAsOf: string | null;
  isin: string | null;
  cusip: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * @interface PlaidInvestmentTransaction
 * @description Raw investment transaction shape from Plaid's investmentsTransactionsGet.
 * type and subtype are raw strings from Plaid — normalised to our enum before storage.
 */
export interface PlaidInvestmentTransaction {
  investment_transaction_id: string;
  account_id: string;
  security_id: string;
  date: string;
  name: string;
  quantity: number;
  amount: number;
  price: number;
  fees: number | null;
  type: string;
  subtype: string | null;
  iso_currency_code: string | null;
  unofficial_currency_code: string | null;
}

/**
 * @interface PlaidHolding
 * @description Raw holding shape from Plaid's investmentsHoldingsGet holdings array.
 * Joined with PlaidSecurity via security_id before storage.
 */
export interface PlaidHolding {
  account_id: string;
  security_id: string;
  quantity: number;
  institution_price: number;
  institution_value: number;
  cost_basis: number | null;
  iso_currency_code: string | null;
  unofficial_currency_code: string | null;
}

/**
 * @interface PlaidSecurity
 * @description Security metadata from Plaid's securities array.
 * Returned alongside both holdings and investment transactions. type is a raw
 * string from Plaid — normalised to SecurityType before storage.
 */
export interface PlaidSecurity {
  security_id: string;
  name: string | null;
  ticker_symbol: string | null;
  type: string | null;
  close_price: number | null;
  close_price_as_of: string | null;
  isin: string | null;
  cusip: string | null;
}

/**
 * @interface InvestmentSyncResult
 * @description Result envelope returned by updateInvestments.
 * transactionsUpserted and holdingsUpserted are reported separately because
 * they are independent operations with different expected volumes.
 */
export interface InvestmentSyncResult {
  transactionsUpserted: number;
  holdingsUpserted: number;
  snapshotDate: string;
}
