/**
 * @module investments.service
 * @description Business logic layer for the Investments module.
 * All other modules import from here — never from the repository directly.
 *
 * Two distinct sync operations share this module because they share the same
 * Plaid access token and sync trigger (updateInvestments):
 *
 *   syncTransactions — investmentsTransactionsGet, date-range pull, offset-paginated.
 *     Fetches the full window on every sync and upserts idempotently. Plaid can
 *     retroactively correct investment transactions (cost basis, corporate actions),
 *     so re-fetching and overwriting is the correct model.
 *
 *   syncHoldings — investmentsHoldingsGet, single call, no pagination.
 *     Returns the complete current holdings for the item. Each sync result is
 *     stored as a new set of rows keyed by the sync date, preserving history.
 */
import { plaidClient } from '../../lib/plaidClient.js';
import { getItemForSync } from '../items/items.service.js';
import {
  getHoldingsBySnapshotDate,
  getHoldingsSince as repoGetHoldingsSince,
  getInvestmentTransactionsInRange as repoGetInvestmentTransactionsInRange,
  getInvestmentTransactionsSince as repoGetInvestmentTransactionsSince,
  getLatestHoldingsByUser,
  upsertHolding,
  upsertInvestmentTransaction,
} from './investments.repository.js';
import type {
  Holding,
  InvestmentSyncResult,
  InvestmentTransaction,
  InvestmentTransactionType,
  PlaidHolding,
  PlaidInvestmentTransaction,
  PlaidSecurity,
  SecurityType,
} from './investments.types.js';

const INITIAL_SYNC_DAYS = 730;
const PAGE_SIZE = 500;

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Maps a raw Plaid investment transaction type string to our InvestmentTransactionType.
 * Returns 'transfer' as the fallback for any value Plaid introduces in the future.
 *
 * @param {string} type - Raw type string from Plaid.
 * @returns {InvestmentTransactionType}
 */
export function normalizeInvestmentTransactionType(type: string): InvestmentTransactionType {
  const known: InvestmentTransactionType[] = ['buy', 'sell', 'dividend', 'transfer', 'cash', 'fee'];
  return known.includes(type as InvestmentTransactionType)
    ? (type as InvestmentTransactionType)
    : 'transfer';
}

/**
 * Maps a raw Plaid security type string to our SecurityType.
 * Returns 'other' for unknown values or null (Plaid omits the field for some securities).
 *
 * @param {string | null} type - Raw security type from Plaid, or null if absent.
 * @returns {SecurityType}
 */
export function normalizeSecurityType(type: string | null): SecurityType {
  const known: SecurityType[] = [
    'cash',
    'cryptocurrency',
    'derivative',
    'equity',
    'etf',
    'fixed income',
    'loan',
    'mutual fund',
    'other',
  ];
  if (type === null) return 'other';
  return known.includes(type as SecurityType) ? (type as SecurityType) : 'other';
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Formats a Date object to a YYYY-MM-DD string.
 * Used everywhere a date string is needed for Plaid API calls and sort keys.
 *
 * @param {Date} date - The date to format.
 * @returns {string} YYYY-MM-DD representation.
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Returns a Date object representing the point in time `days` days before now.
 *
 * @param {number} days - Number of days to subtract from the current time.
 * @returns {Date}
 */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Mapping functions
// ---------------------------------------------------------------------------

/**
 * Maps a raw Plaid investment transaction to our InvestmentTransaction storage shape.
 * Pure function — no database calls, no side effects.
 *
 * dateTransactionId is built as "date#investment_transaction_id" to enable
 * DynamoDB's BETWEEN operator for date range queries. ISO dates sort correctly
 * as plain strings, so the composite key sorts chronologically.
 *
 * createdAt is preserved from existingCreatedAt when provided (idempotent
 * re-processing when Plaid corrects the same transaction). updatedAt is
 * always refreshed to the current time.
 *
 * @param {string} userId - UUID of the user who owns this transaction.
 * @param {PlaidInvestmentTransaction} plaidTx - Raw transaction from the Plaid API.
 * @param {string} [existingCreatedAt] - Original creation timestamp to preserve on re-sync.
 * @returns {InvestmentTransaction}
 */
export function mapInvestmentTransaction(
  userId: string,
  plaidTx: PlaidInvestmentTransaction,
  existingCreatedAt?: string,
): InvestmentTransaction {
  const now = new Date().toISOString();

  return {
    userId,
    dateTransactionId: `${plaidTx.date}#${plaidTx.investment_transaction_id}`,
    investmentTransactionId: plaidTx.investment_transaction_id,
    plaidAccountId: plaidTx.account_id,
    securityId: plaidTx.security_id,
    date: plaidTx.date,
    name: plaidTx.name,
    quantity: plaidTx.quantity,
    amount: plaidTx.amount,
    price: plaidTx.price,
    fees: plaidTx.fees,
    type: normalizeInvestmentTransactionType(plaidTx.type),
    subtype: plaidTx.subtype,
    isoCurrencyCode: plaidTx.iso_currency_code,
    unofficialCurrencyCode: plaidTx.unofficial_currency_code,
    createdAt: existingCreatedAt ?? now,
    updatedAt: now,
  };
}

/**
 * Maps a raw Plaid holding and its matched security to our Holding storage shape.
 * Pure function — no database calls, no side effects.
 *
 * Security metadata is inlined onto the holding at sync time so stored records
 * are self-contained and require no join at read time. A missing security (null)
 * must not crash the sync — all security fields default to null in that case.
 *
 * snapshotDateAccountSecurity is built as "snapshotDate#accountId#securityId"
 * so all holdings within a snapshot sort together and can be range-queried.
 *
 * @param {string} userId - UUID of the user who owns this holding.
 * @param {PlaidHolding} plaidHolding - Raw holding from the Plaid API.
 * @param {PlaidSecurity | null} security - Matched security metadata, or null if absent.
 * @param {string} snapshotDate - YYYY-MM-DD date this snapshot was taken.
 * @param {string} [existingCreatedAt] - Original creation timestamp to preserve on re-sync.
 * @returns {Holding}
 */
export function mapHolding(
  userId: string,
  plaidHolding: PlaidHolding,
  security: PlaidSecurity | null,
  snapshotDate: string,
  existingCreatedAt?: string,
): Holding {
  const now = new Date().toISOString();

  return {
    userId,
    snapshotDateAccountSecurity: `${snapshotDate}#${plaidHolding.account_id}#${plaidHolding.security_id}`,
    plaidAccountId: plaidHolding.account_id,
    securityId: plaidHolding.security_id,
    snapshotDate,
    quantity: plaidHolding.quantity,
    institutionPrice: plaidHolding.institution_price,
    institutionValue: plaidHolding.institution_value,
    costBasis: plaidHolding.cost_basis,
    isoCurrencyCode: plaidHolding.iso_currency_code,
    unofficialCurrencyCode: plaidHolding.unofficial_currency_code,
    // Inline security metadata — a missing security must not crash the sync
    securityName: security?.name ?? null,
    tickerSymbol: security?.ticker_symbol ?? null,
    securityType: normalizeSecurityType(security?.type ?? null),
    closePrice: security?.close_price ?? null,
    closePriceAsOf: security?.close_price_as_of ?? null,
    isin: security?.isin ?? null,
    cusip: security?.cusip ?? null,
    createdAt: existingCreatedAt ?? now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Core sync functions
// ---------------------------------------------------------------------------

/**
 * Fetches and upserts all investment transactions for a bank connection.
 * Uses offset pagination — loops calling investmentsTransactionsGet with
 * count: PAGE_SIZE and an incrementing offset until a page returns fewer
 * transactions than PAGE_SIZE (signals the final page).
 *
 * The date range is recalculated on every call (INITIAL_SYNC_DAYS ago → today).
 * Re-fetching and overwriting is correct because Plaid can retroactively update
 * investment transactions within the window.
 *
 * @param {string} userId - UUID of the user who owns the bank connection.
 * @param {string} accessToken - Decrypted Plaid access token for the connection.
 * @returns {Promise<number>} Total count of transactions upserted.
 */
export async function syncTransactions(userId: string, accessToken: string): Promise<number> {
  const startDate = formatDate(daysAgo(INITIAL_SYNC_DAYS));
  const endDate = formatDate(new Date());

  let offset = 0;
  let total = 0;

  // Plaid can return the same logical transaction under different account IDs
  // (and with different investment_transaction_id values). Deduplicate by a
  // content signature so we only store each unique transaction once.
  const seen = new Set<string>();

  while (true) {
    const response = await plaidClient.investmentsTransactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { count: PAGE_SIZE, offset },
    });

    const transactions = response.data
      .investment_transactions as unknown as PlaidInvestmentTransaction[];

    const unique = transactions.filter((plaidTx) => {
      const sig = `${plaidTx.date}|${plaidTx.security_id}|${plaidTx.amount}|${plaidTx.type}|${plaidTx.subtype}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });

    await Promise.all(
      unique.map(async (plaidTx) => {
        const tx = mapInvestmentTransaction(userId, plaidTx);
        await upsertInvestmentTransaction(tx);
      }),
    );

    total += unique.length;
    offset += transactions.length;

    // Fewer results than PAGE_SIZE means this is the final page.
    if (transactions.length < PAGE_SIZE) break;
  }

  return total;
}

/**
 * Fetches and upserts the current holdings snapshot for a bank connection.
 * investmentsHoldingsGet is a single call with no pagination — it always
 * returns the complete current state of all open positions.
 *
 * Each call stores a new set of rows keyed by today's date, preserving
 * a history of snapshots. The same snapshotDate is used for every holding
 * in the batch so all records belong to the same logical snapshot.
 *
 * A Map keyed by security_id is built once for O(1) lookups — using
 * Array.find() in the mapping loop would be O(n²) for large portfolios.
 *
 * @param {string} userId - UUID of the user who owns the bank connection.
 * @param {string} accessToken - Decrypted Plaid access token for the connection.
 * @returns {Promise<{ count: number; snapshotDate: string }>}
 */
export async function syncHoldings(
  userId: string,
  accessToken: string,
): Promise<{ count: number; snapshotDate: string }> {
  const response = await plaidClient.investmentsHoldingsGet({
    access_token: accessToken,
  });

  const holdings = response.data.holdings as unknown as PlaidHolding[];
  const securities = response.data.securities as unknown as PlaidSecurity[];

  // Calculate snapshotDate once — all holdings in this batch share the same date.
  const snapshotDate = formatDate(new Date());

  if (holdings.length === 0) {
    return { count: 0, snapshotDate };
  }

  // Build a Map for O(1) security lookups instead of O(n) Array.find() per holding.
  const securityMap = new Map<string, PlaidSecurity>(
    securities.map((sec) => [sec.security_id, sec]),
  );

  await Promise.all(
    holdings.map(async (plaidHolding) => {
      const security = securityMap.get(plaidHolding.security_id) ?? null;
      const holding = mapHolding(userId, plaidHolding, security, snapshotDate);
      await upsertHolding(holding);
    }),
  );

  return { count: holdings.length, snapshotDate };
}

// ---------------------------------------------------------------------------
// Public orchestration function
// ---------------------------------------------------------------------------

/**
 * Runs a full investment data sync for a single bank connection.
 * Fetches the decrypted access token from items.service, then runs
 * syncTransactions and syncHoldings in parallel — they are independent
 * operations that share only the access token as input.
 *
 * @param {string} userId - UUID of the user who owns the bank connection.
 * @param {string} itemId - Plaid item ID of the bank connection to sync.
 * @returns {Promise<InvestmentSyncResult>} Counts of records synced and the snapshot date.
 */
export async function updateInvestments(
  userId: string,
  itemId: string,
): Promise<InvestmentSyncResult> {
  const item = await getItemForSync(itemId);

  const [transactionsUpserted, { count: holdingsUpserted, snapshotDate }] = await Promise.all([
    syncTransactions(userId, item.accessToken),
    syncHoldings(userId, item.accessToken),
  ]);

  return { transactionsUpserted, holdingsUpserted, snapshotDate };
}

// ---------------------------------------------------------------------------
// Read methods
// ---------------------------------------------------------------------------

/**
 * Returns the most recent holdings snapshot for a user.
 *
 * @param {string} userId - UUID of the user whose holdings to fetch.
 * @returns {Promise<Holding[]>}
 */
export async function getLatestHoldings(userId: string): Promise<Holding[]> {
  return getLatestHoldingsByUser(userId);
}

/**
 * Returns all holdings for a user on a specific snapshot date.
 *
 * @param {string} userId - UUID of the user whose holdings to fetch.
 * @param {string} date - YYYY-MM-DD snapshot date.
 * @returns {Promise<Holding[]>}
 */
export async function getHoldingsOnDate(userId: string, date: string): Promise<Holding[]> {
  return getHoldingsBySnapshotDate(userId, date);
}

/**
 * Returns all holdings for a user from sinceDate forward across all snapshots.
 *
 * @param {string} userId - UUID of the user whose holdings to fetch.
 * @param {string} sinceDate - YYYY-MM-DD lower bound (inclusive).
 * @returns {Promise<Holding[]>}
 */
export async function getHoldingsSince(userId: string, sinceDate: string): Promise<Holding[]> {
  return repoGetHoldingsSince(userId, sinceDate);
}

/**
 * Returns investment transactions for a user on or after sinceDate.
 *
 * @param {string} userId - UUID of the user whose transactions to fetch.
 * @param {string} sinceDate - YYYY-MM-DD lower bound (inclusive).
 * @returns {Promise<InvestmentTransaction[]>}
 */
export async function getTransactionsSince(
  userId: string,
  sinceDate: string,
): Promise<InvestmentTransaction[]> {
  return repoGetInvestmentTransactionsSince(userId, sinceDate);
}

/**
 * Returns investment transactions for a user within a date range (both dates inclusive).
 *
 * @param {string} userId - UUID of the user whose transactions to fetch.
 * @param {string} startDate - YYYY-MM-DD lower bound (inclusive).
 * @param {string} endDate - YYYY-MM-DD upper bound (inclusive).
 * @returns {Promise<InvestmentTransaction[]>}
 */
export async function getTransactionsInRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<InvestmentTransaction[]> {
  return repoGetInvestmentTransactionsInRange(userId, startDate, endDate);
}
