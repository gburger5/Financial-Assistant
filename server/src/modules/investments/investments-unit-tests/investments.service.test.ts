/**
 * @module investments.service.test
 * @description Unit tests for the Investments service (business logic layer).
 * The repository, Plaid client, and items service are all fully mocked —
 * no DynamoDB calls or real HTTP requests are made.
 *
 * Key behaviors under test:
 *   - normalizeInvestmentTransactionType: maps Plaid raw strings to our enum, 'transfer' fallback
 *   - normalizeSecurityType: maps Plaid raw strings to our enum, 'other' fallback for null/unknown
 *   - formatDate: converts a Date to YYYY-MM-DD
 *   - daysAgo: returns a Date n days before now
 *   - mapInvestmentTransaction: pure mapping from Plaid API shape → InvestmentTransaction
 *   - mapHolding: pure mapping from Plaid holding + security → Holding (inlines security metadata)
 *   - syncTransactions: offset-paginated loop, stops when page < PAGE_SIZE, upserts all
 *   - syncHoldings: single call, builds security Map, upserts all, returns count + snapshotDate
 *   - updateInvestments: calls getItemForSync then runs syncTransactions + syncHoldings in parallel
 *   - read delegates: getLatestHoldings, getHoldingsOnDate, getHoldingsSince,
 *                     getTransactionsSince, getTransactionsInRange
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../investments.repository.js', () => ({
  upsertInvestmentTransaction: vi.fn(),
  getInvestmentTransactionsSince: vi.fn(),
  getInvestmentTransactionsInRange: vi.fn(),
  upsertHolding: vi.fn(),
  getLatestHoldingsByUser: vi.fn(),
  getHoldingsBySnapshotDate: vi.fn(),
  getHoldingsSince: vi.fn(),
  getAllHoldingsByUser: vi.fn(),
  getHoldingsByAccountId: vi.fn(),
}));

vi.mock('../../items/items.service.js', () => ({
  getItemForSync: vi.fn(),
}));

// vi.hoisted() makes mock functions available inside the vi.mock factory.
const { mockInvestmentsTransactionsGet, mockInvestmentsHoldingsGet } = vi.hoisted(() => ({
  mockInvestmentsTransactionsGet: vi.fn(),
  mockInvestmentsHoldingsGet: vi.fn(),
}));
vi.mock('../../../lib/plaidClient.js', () => ({
  plaidClient: {
    investmentsTransactionsGet: mockInvestmentsTransactionsGet,
    investmentsHoldingsGet: mockInvestmentsHoldingsGet,
  },
}));

import {
  normalizeInvestmentTransactionType,
  normalizeSecurityType,
  formatDate,
  daysAgo,
  mapInvestmentTransaction,
  mapHolding,
  syncTransactions,
  syncHoldings,
  updateInvestments,
  getLatestHoldings,
  getHoldingsOnDate,
  getHoldingsSince,
  getTransactionsSince,
  getTransactionsInRange,
} from '../investments.service.js';
import * as repo from '../investments.repository.js';
import * as itemsService from '../../items/items.service.js';
import type {
  InvestmentTransaction,
  Holding,
  PlaidInvestmentTransaction,
  PlaidHolding,
  PlaidSecurity,
} from '../investments.types.js';

const mockUpsertInvestmentTransaction = vi.mocked(repo.upsertInvestmentTransaction);
const mockUpsertHolding = vi.mocked(repo.upsertHolding);
const mockGetInvestmentTransactionsSince = vi.mocked(repo.getInvestmentTransactionsSince);
const mockGetInvestmentTransactionsInRange = vi.mocked(repo.getInvestmentTransactionsInRange);
const mockGetLatestHoldingsByUser = vi.mocked(repo.getLatestHoldingsByUser);
const mockGetHoldingsBySnapshotDate = vi.mocked(repo.getHoldingsBySnapshotDate);
const mockGetHoldingsSince = vi.mocked(repo.getHoldingsSince);
const mockGetItemForSync = vi.mocked(itemsService.getItemForSync);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const samplePlaidInvTx: PlaidInvestmentTransaction = {
  investment_transaction_id: 'inv-txn-abc',
  account_id: 'acct-xyz',
  security_id: 'sec-123',
  date: '2025-01-15',
  name: 'Apple Inc.',
  quantity: 10,
  amount: 1500.0,
  price: 150.0,
  fees: 0.99,
  type: 'buy',
  subtype: 'buy',
  iso_currency_code: 'USD',
  unofficial_currency_code: null,
};

const samplePlaidHolding: PlaidHolding = {
  account_id: 'acct-xyz',
  security_id: 'sec-123',
  quantity: 10,
  institution_price: 150.0,
  institution_value: 1500.0,
  cost_basis: 1490.0,
  iso_currency_code: 'USD',
  unofficial_currency_code: null,
};

const samplePlaidSecurity: PlaidSecurity = {
  security_id: 'sec-123',
  name: 'Apple Inc.',
  ticker_symbol: 'AAPL',
  type: 'equity',
  close_price: 151.0,
  close_price_as_of: '2025-01-14',
  isin: 'US0378331005',
  cusip: '037833100',
};

const sampleInvestmentTransaction: InvestmentTransaction = {
  userId: 'user-123',
  dateTransactionId: '2025-01-15#inv-txn-abc',
  investmentTransactionId: 'inv-txn-abc',
  plaidAccountId: 'acct-xyz',
  securityId: 'sec-123',
  date: '2025-01-15',
  name: 'Apple Inc.',
  quantity: 10,
  amount: 1500.0,
  price: 150.0,
  fees: 0.99,
  type: 'buy',
  subtype: 'buy',
  isoCurrencyCode: 'USD',
  unofficialCurrencyCode: null,
  createdAt: '2025-01-15T10:00:00.000Z',
  updatedAt: '2025-01-15T10:00:00.000Z',
};

const sampleHolding: Holding = {
  userId: 'user-123',
  snapshotDateAccountSecurity: '2025-01-15#acct-xyz#sec-123',
  plaidAccountId: 'acct-xyz',
  securityId: 'sec-123',
  snapshotDate: '2025-01-15',
  quantity: 10,
  institutionPrice: 150.0,
  institutionValue: 1500.0,
  costBasis: 1490.0,
  isoCurrencyCode: 'USD',
  unofficialCurrencyCode: null,
  securityName: 'Apple Inc.',
  tickerSymbol: 'AAPL',
  securityType: 'equity',
  closePrice: 151.0,
  closePriceAsOf: '2025-01-14',
  isin: 'US0378331005',
  cusip: '037833100',
  createdAt: '2025-01-15T10:00:00.000Z',
  updatedAt: '2025-01-15T10:00:00.000Z',
};

/** Minimal PlaidItem with decrypted access token, as returned by getItemForSync. */
const sampleItem = {
  userId: 'user-123',
  itemId: 'item-abc',
  accessToken: 'access-sandbox-token',
  institutionId: 'ins-1',
  institutionName: 'Test Bank',
  status: 'active' as const,
  transactionCursor: null,
  consentExpirationTime: null,
  linkedAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

/**
 * Builds a mock investmentsTransactionsGet response for one page.
 * Returns fewer than PAGE_SIZE (500) transactions by default to signal the final page.
 */
function makeTransactionsPage(transactions: PlaidInvestmentTransaction[]) {
  return {
    data: {
      investment_transactions: transactions,
      securities: [samplePlaidSecurity],
      total_investment_transactions: transactions.length,
    },
  };
}

/** Builds a mock investmentsHoldingsGet response. */
function makeHoldingsResponse(holdings: PlaidHolding[], securities: PlaidSecurity[]) {
  return {
    data: {
      holdings,
      securities,
    },
  };
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// normalizeInvestmentTransactionType
// ---------------------------------------------------------------------------

describe('normalizeInvestmentTransactionType', () => {
  it.each([
    ['buy', 'buy'],
    ['sell', 'sell'],
    ['dividend', 'dividend'],
    ['transfer', 'transfer'],
    ['cash', 'cash'],
    ['fee', 'fee'],
  ] as const)('maps "%s" to "%s"', (input, expected) => {
    expect(normalizeInvestmentTransactionType(input)).toBe(expected);
  });

  it('returns "transfer" for an unknown type string', () => {
    expect(normalizeInvestmentTransactionType('unknown_type')).toBe('transfer');
  });

  it('returns "transfer" for an empty string', () => {
    expect(normalizeInvestmentTransactionType('')).toBe('transfer');
  });
});

// ---------------------------------------------------------------------------
// normalizeSecurityType
// ---------------------------------------------------------------------------

describe('normalizeSecurityType', () => {
  it.each([
    ['cash', 'cash'],
    ['cryptocurrency', 'cryptocurrency'],
    ['derivative', 'derivative'],
    ['equity', 'equity'],
    ['etf', 'etf'],
    ['fixed income', 'fixed income'],
    ['loan', 'loan'],
    ['mutual fund', 'mutual fund'],
    ['other', 'other'],
  ] as const)('maps "%s" to "%s"', (input, expected) => {
    expect(normalizeSecurityType(input)).toBe(expected);
  });

  it('returns "other" for null', () => {
    expect(normalizeSecurityType(null)).toBe('other');
  });

  it('returns "other" for an unknown type string', () => {
    expect(normalizeSecurityType('unknown_type')).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  it('formats a Date to a YYYY-MM-DD string', () => {
    // Use UTC noon to avoid timezone boundary issues
    const date = new Date('2025-06-15T12:00:00.000Z');
    expect(formatDate(date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a 10-character date string', () => {
    expect(formatDate(new Date())).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// daysAgo
// ---------------------------------------------------------------------------

describe('daysAgo', () => {
  it('returns a Date instance', () => {
    expect(daysAgo(30)).toBeInstanceOf(Date);
  });

  it('returns a date approximately n days before now', () => {
    const before = Date.now();
    const result = daysAgo(30);
    const after = Date.now();

    const msInDay = 24 * 60 * 60 * 1000;
    const expectedMs = before - 30 * msInDay;
    // Allow 1-second tolerance for test execution time
    expect(result.getTime()).toBeGreaterThanOrEqual(expectedMs - 1000);
    expect(result.getTime()).toBeLessThanOrEqual(after - 30 * msInDay + 1000);
  });
});

// ---------------------------------------------------------------------------
// mapInvestmentTransaction
// ---------------------------------------------------------------------------

describe('mapInvestmentTransaction', () => {
  it('sets userId from the first parameter', () => {
    const result = mapInvestmentTransaction('user-123', samplePlaidInvTx);
    expect(result.userId).toBe('user-123');
  });

  it('builds dateTransactionId as "date#investment_transaction_id"', () => {
    const result = mapInvestmentTransaction('user-123', samplePlaidInvTx);
    expect(result.dateTransactionId).toBe('2025-01-15#inv-txn-abc');
  });

  it('maps investment_transaction_id to investmentTransactionId', () => {
    const result = mapInvestmentTransaction('user-123', samplePlaidInvTx);
    expect(result.investmentTransactionId).toBe('inv-txn-abc');
  });

  it('maps account_id to plaidAccountId', () => {
    const result = mapInvestmentTransaction('user-123', samplePlaidInvTx);
    expect(result.plaidAccountId).toBe('acct-xyz');
  });

  it('maps security_id to securityId', () => {
    const result = mapInvestmentTransaction('user-123', samplePlaidInvTx);
    expect(result.securityId).toBe('sec-123');
  });

  it('copies the date field directly', () => {
    const result = mapInvestmentTransaction('user-123', samplePlaidInvTx);
    expect(result.date).toBe('2025-01-15');
  });

  it('copies the name field directly', () => {
    const result = mapInvestmentTransaction('user-123', samplePlaidInvTx);
    expect(result.name).toBe('Apple Inc.');
  });

  it('copies quantity, amount, price, and fees directly', () => {
    const result = mapInvestmentTransaction('user-123', samplePlaidInvTx);
    expect(result.quantity).toBe(10);
    expect(result.amount).toBe(1500.0);
    expect(result.price).toBe(150.0);
    expect(result.fees).toBe(0.99);
  });

  it('maps null fees to null', () => {
    const tx: PlaidInvestmentTransaction = { ...samplePlaidInvTx, fees: null };
    const result = mapInvestmentTransaction('user-123', tx);
    expect(result.fees).toBeNull();
  });

  it('normalizes the type via normalizeInvestmentTransactionType', () => {
    const result = mapInvestmentTransaction('user-123', samplePlaidInvTx);
    expect(result.type).toBe('buy');
  });

  it('maps an unknown Plaid type to the "transfer" fallback', () => {
    const tx: PlaidInvestmentTransaction = { ...samplePlaidInvTx, type: 'unknown_event' };
    const result = mapInvestmentTransaction('user-123', tx);
    expect(result.type).toBe('transfer');
  });

  it('copies the subtype field directly', () => {
    const result = mapInvestmentTransaction('user-123', samplePlaidInvTx);
    expect(result.subtype).toBe('buy');
  });

  it('maps null subtype to null', () => {
    const tx: PlaidInvestmentTransaction = { ...samplePlaidInvTx, subtype: null };
    const result = mapInvestmentTransaction('user-123', tx);
    expect(result.subtype).toBeNull();
  });

  it('maps iso_currency_code to isoCurrencyCode', () => {
    const result = mapInvestmentTransaction('user-123', samplePlaidInvTx);
    expect(result.isoCurrencyCode).toBe('USD');
  });

  it('maps null iso_currency_code to null', () => {
    const tx: PlaidInvestmentTransaction = { ...samplePlaidInvTx, iso_currency_code: null };
    const result = mapInvestmentTransaction('user-123', tx);
    expect(result.isoCurrencyCode).toBeNull();
  });

  it('sets createdAt to a current ISO timestamp when existingCreatedAt is not provided', () => {
    const before = new Date().toISOString();
    const result = mapInvestmentTransaction('user-123', samplePlaidInvTx);
    const after = new Date().toISOString();
    expect(result.createdAt >= before).toBe(true);
    expect(result.createdAt <= after).toBe(true);
  });

  it('uses existingCreatedAt when provided, preserving the original creation time', () => {
    const originalTime = '2024-06-01T08:00:00.000Z';
    const result = mapInvestmentTransaction('user-123', samplePlaidInvTx, originalTime);
    expect(result.createdAt).toBe(originalTime);
  });

  it('always sets updatedAt to a current ISO timestamp regardless of existingCreatedAt', () => {
    const originalTime = '2024-06-01T08:00:00.000Z';
    const before = new Date().toISOString();
    const result = mapInvestmentTransaction('user-123', samplePlaidInvTx, originalTime);
    const after = new Date().toISOString();
    expect(result.updatedAt >= before).toBe(true);
    expect(result.updatedAt <= after).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mapHolding
// ---------------------------------------------------------------------------

describe('mapHolding', () => {
  it('sets userId from the first parameter', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.userId).toBe('user-123');
  });

  it('builds snapshotDateAccountSecurity as "snapshotDate#accountId#securityId"', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.snapshotDateAccountSecurity).toBe('2025-01-15#acct-xyz#sec-123');
  });

  it('maps account_id to plaidAccountId', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.plaidAccountId).toBe('acct-xyz');
  });

  it('maps security_id to securityId', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.securityId).toBe('sec-123');
  });

  it('sets snapshotDate to the provided snapshotDate string', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.snapshotDate).toBe('2025-01-15');
  });

  it('copies quantity, institutionPrice, institutionValue directly', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.quantity).toBe(10);
    expect(result.institutionPrice).toBe(150.0);
    expect(result.institutionValue).toBe(1500.0);
  });

  it('maps cost_basis to costBasis', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.costBasis).toBe(1490.0);
  });

  it('maps null cost_basis to null', () => {
    const holding: PlaidHolding = { ...samplePlaidHolding, cost_basis: null };
    const result = mapHolding('user-123', holding, samplePlaidSecurity, '2025-01-15');
    expect(result.costBasis).toBeNull();
  });

  it('maps iso_currency_code to isoCurrencyCode', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.isoCurrencyCode).toBe('USD');
  });

  it('inlines security.name as securityName', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.securityName).toBe('Apple Inc.');
  });

  it('inlines security.ticker_symbol as tickerSymbol', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.tickerSymbol).toBe('AAPL');
  });

  it('normalizes security.type via normalizeSecurityType', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.securityType).toBe('equity');
  });

  it('inlines security.close_price as closePrice', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.closePrice).toBe(151.0);
  });

  it('inlines security.close_price_as_of as closePriceAsOf', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.closePriceAsOf).toBe('2025-01-14');
  });

  it('inlines security.isin as isin', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.isin).toBe('US0378331005');
  });

  it('inlines security.cusip as cusip', () => {
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    expect(result.cusip).toBe('037833100');
  });

  it('sets all security fields to null when security is null — a missing security must not crash the sync', () => {
    const result = mapHolding('user-123', samplePlaidHolding, null, '2025-01-15');
    expect(result.securityName).toBeNull();
    expect(result.tickerSymbol).toBeNull();
    expect(result.securityType).toBe('other');
    expect(result.closePrice).toBeNull();
    expect(result.closePriceAsOf).toBeNull();
    expect(result.isin).toBeNull();
    expect(result.cusip).toBeNull();
  });

  it('sets createdAt to a current ISO timestamp when existingCreatedAt is not provided', () => {
    const before = new Date().toISOString();
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15');
    const after = new Date().toISOString();
    expect(result.createdAt >= before).toBe(true);
    expect(result.createdAt <= after).toBe(true);
  });

  it('uses existingCreatedAt when provided, preserving the original creation time', () => {
    const originalTime = '2024-06-01T08:00:00.000Z';
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15', originalTime);
    expect(result.createdAt).toBe(originalTime);
  });

  it('always sets updatedAt to a current ISO timestamp regardless of existingCreatedAt', () => {
    const originalTime = '2024-06-01T08:00:00.000Z';
    const before = new Date().toISOString();
    const result = mapHolding('user-123', samplePlaidHolding, samplePlaidSecurity, '2025-01-15', originalTime);
    const after = new Date().toISOString();
    expect(result.updatedAt >= before).toBe(true);
    expect(result.updatedAt <= after).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// syncTransactions
// ---------------------------------------------------------------------------

describe('syncTransactions', () => {
  it('calls investmentsTransactionsGet with the provided accessToken', async () => {
    mockInvestmentsTransactionsGet.mockResolvedValue(makeTransactionsPage([]));
    await syncTransactions('user-123', 'access-sandbox-token');
    const arg = mockInvestmentsTransactionsGet.mock.calls[0][0];
    expect(arg.access_token).toBe('access-sandbox-token');
  });

  it('calls investmentsTransactionsGet with the start and end date range', async () => {
    mockInvestmentsTransactionsGet.mockResolvedValue(makeTransactionsPage([]));
    await syncTransactions('user-123', 'access-sandbox-token');
    const arg = mockInvestmentsTransactionsGet.mock.calls[0][0];
    expect(arg.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(arg.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('calls investmentsTransactionsGet with count: 500 (PAGE_SIZE)', async () => {
    mockInvestmentsTransactionsGet.mockResolvedValue(makeTransactionsPage([]));
    await syncTransactions('user-123', 'access-sandbox-token');
    const arg = mockInvestmentsTransactionsGet.mock.calls[0][0];
    expect(arg.options?.count).toBe(500);
  });

  it('calls investmentsTransactionsGet with offset: 0 on the first call', async () => {
    mockInvestmentsTransactionsGet.mockResolvedValue(makeTransactionsPage([]));
    await syncTransactions('user-123', 'access-sandbox-token');
    const arg = mockInvestmentsTransactionsGet.mock.calls[0][0];
    expect(arg.options?.offset).toBe(0);
  });

  it('upserts all transactions from a single page', async () => {
    const tx2: PlaidInvestmentTransaction = { ...samplePlaidInvTx, investment_transaction_id: 'inv-txn-2' };
    mockInvestmentsTransactionsGet.mockResolvedValue(makeTransactionsPage([samplePlaidInvTx, tx2]));
    mockUpsertInvestmentTransaction.mockResolvedValue(undefined);
    await syncTransactions('user-123', 'access-sandbox-token');
    expect(mockUpsertInvestmentTransaction).toHaveBeenCalledTimes(2);
  });

  it('stops looping when the page contains fewer transactions than PAGE_SIZE', async () => {
    // One transaction returned < PAGE_SIZE (500), so it is the final page
    mockInvestmentsTransactionsGet.mockResolvedValue(makeTransactionsPage([samplePlaidInvTx]));
    mockUpsertInvestmentTransaction.mockResolvedValue(undefined);
    await syncTransactions('user-123', 'access-sandbox-token');
    expect(mockInvestmentsTransactionsGet).toHaveBeenCalledTimes(1);
  });

  it('increments the offset by PAGE_SIZE and loops when the first page is full', async () => {
    // First page: exactly PAGE_SIZE (500) transactions → loop continues
    const fullPage = Array.from({ length: 500 }, (_, i) => ({
      ...samplePlaidInvTx,
      investment_transaction_id: `inv-txn-${i}`,
    }));
    // Second page: 0 transactions → loop ends
    mockInvestmentsTransactionsGet
      .mockResolvedValueOnce(makeTransactionsPage(fullPage))
      .mockResolvedValueOnce(makeTransactionsPage([]));
    mockUpsertInvestmentTransaction.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'access-sandbox-token');

    expect(mockInvestmentsTransactionsGet).toHaveBeenCalledTimes(2);
    const secondCallArg = mockInvestmentsTransactionsGet.mock.calls[1][0];
    expect(secondCallArg.options?.offset).toBe(500);
  });

  it('returns the total count of upserted transactions across all pages', async () => {
    const fullPage = Array.from({ length: 500 }, (_, i) => ({
      ...samplePlaidInvTx,
      investment_transaction_id: `inv-txn-${i}`,
    }));
    const partialPage = [samplePlaidInvTx];
    mockInvestmentsTransactionsGet
      .mockResolvedValueOnce(makeTransactionsPage(fullPage))
      .mockResolvedValueOnce(makeTransactionsPage(partialPage));
    mockUpsertInvestmentTransaction.mockResolvedValue(undefined);

    const count = await syncTransactions('user-123', 'access-sandbox-token');

    expect(count).toBe(501);
  });

  it('returns 0 when Plaid returns no transactions', async () => {
    mockInvestmentsTransactionsGet.mockResolvedValue(makeTransactionsPage([]));
    const count = await syncTransactions('user-123', 'access-sandbox-token');
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// syncHoldings
// ---------------------------------------------------------------------------

describe('syncHoldings', () => {
  it('calls investmentsHoldingsGet with the provided accessToken', async () => {
    mockInvestmentsHoldingsGet.mockResolvedValue(makeHoldingsResponse([], []));
    await syncHoldings('user-123', 'access-sandbox-token');
    const arg = mockInvestmentsHoldingsGet.mock.calls[0][0];
    expect(arg.access_token).toBe('access-sandbox-token');
  });

  it('calls investmentsHoldingsGet exactly once (no pagination)', async () => {
    mockInvestmentsHoldingsGet.mockResolvedValue(
      makeHoldingsResponse([samplePlaidHolding], [samplePlaidSecurity]),
    );
    mockUpsertHolding.mockResolvedValue(undefined);
    await syncHoldings('user-123', 'access-sandbox-token');
    expect(mockInvestmentsHoldingsGet).toHaveBeenCalledTimes(1);
  });

  it('upserts all holdings from the response', async () => {
    const holding2: PlaidHolding = { ...samplePlaidHolding, security_id: 'sec-456' };
    mockInvestmentsHoldingsGet.mockResolvedValue(
      makeHoldingsResponse([samplePlaidHolding, holding2], [samplePlaidSecurity]),
    );
    mockUpsertHolding.mockResolvedValue(undefined);
    await syncHoldings('user-123', 'access-sandbox-token');
    expect(mockUpsertHolding).toHaveBeenCalledTimes(2);
  });

  it('returns { count: 0, snapshotDate } immediately when holdings is empty — no upserts issued', async () => {
    mockInvestmentsHoldingsGet.mockResolvedValue(makeHoldingsResponse([], []));
    const result = await syncHoldings('user-123', 'access-sandbox-token');
    expect(result.count).toBe(0);
    expect(mockUpsertHolding).not.toHaveBeenCalled();
  });

  it('returns the count of holdings upserted', async () => {
    mockInvestmentsHoldingsGet.mockResolvedValue(
      makeHoldingsResponse([samplePlaidHolding], [samplePlaidSecurity]),
    );
    mockUpsertHolding.mockResolvedValue(undefined);
    const result = await syncHoldings('user-123', 'access-sandbox-token');
    expect(result.count).toBe(1);
  });

  it('returns a snapshotDate string in YYYY-MM-DD format', async () => {
    mockInvestmentsHoldingsGet.mockResolvedValue(
      makeHoldingsResponse([samplePlaidHolding], [samplePlaidSecurity]),
    );
    mockUpsertHolding.mockResolvedValue(undefined);
    const result = await syncHoldings('user-123', 'access-sandbox-token');
    expect(result.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses the same snapshotDate for all holdings in the batch', async () => {
    const holding2: PlaidHolding = { ...samplePlaidHolding, security_id: 'sec-456' };
    mockInvestmentsHoldingsGet.mockResolvedValue(
      makeHoldingsResponse([samplePlaidHolding, holding2], [samplePlaidSecurity]),
    );
    mockUpsertHolding.mockResolvedValue(undefined);
    await syncHoldings('user-123', 'access-sandbox-token');
    // Both upserted holdings must share the same snapshotDate embedded in their SK
    const call1 = mockUpsertHolding.mock.calls[0][0];
    const call2 = mockUpsertHolding.mock.calls[1][0];
    expect(call1.snapshotDate).toBe(call2.snapshotDate);
  });

  it('performs O(1) security lookup — passes the matched security object to mapHolding', async () => {
    const security2: PlaidSecurity = { ...samplePlaidSecurity, security_id: 'sec-456', ticker_symbol: 'MSFT' };
    const holding2: PlaidHolding = { ...samplePlaidHolding, security_id: 'sec-456' };
    mockInvestmentsHoldingsGet.mockResolvedValue(
      makeHoldingsResponse([samplePlaidHolding, holding2], [samplePlaidSecurity, security2]),
    );
    mockUpsertHolding.mockResolvedValue(undefined);
    await syncHoldings('user-123', 'access-sandbox-token');
    // Each holding should have been matched to its correct security
    const calls = mockUpsertHolding.mock.calls.map((c) => c[0] as Holding);
    const appleHolding = calls.find((h) => h.securityId === 'sec-123');
    const msftHolding = calls.find((h) => h.securityId === 'sec-456');
    expect(appleHolding?.tickerSymbol).toBe('AAPL');
    expect(msftHolding?.tickerSymbol).toBe('MSFT');
  });
});

// ---------------------------------------------------------------------------
// updateInvestments
// ---------------------------------------------------------------------------

describe('updateInvestments', () => {
  it('calls getItemForSync with the provided itemId', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockInvestmentsTransactionsGet.mockResolvedValue(makeTransactionsPage([]));
    mockInvestmentsHoldingsGet.mockResolvedValue(makeHoldingsResponse([], []));
    mockUpsertInvestmentTransaction.mockResolvedValue(undefined);
    mockUpsertHolding.mockResolvedValue(undefined);

    await updateInvestments('user-123', 'item-abc');

    expect(mockGetItemForSync).toHaveBeenCalledWith('item-abc');
  });

  it('uses the decrypted accessToken from getItemForSync for both Plaid calls', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockInvestmentsTransactionsGet.mockResolvedValue(makeTransactionsPage([]));
    mockInvestmentsHoldingsGet.mockResolvedValue(makeHoldingsResponse([], []));

    await updateInvestments('user-123', 'item-abc');

    expect(mockInvestmentsTransactionsGet.mock.calls[0][0].access_token).toBe('access-sandbox-token');
    expect(mockInvestmentsHoldingsGet.mock.calls[0][0].access_token).toBe('access-sandbox-token');
  });

  it('runs syncTransactions and syncHoldings in parallel (both Plaid calls made)', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockInvestmentsTransactionsGet.mockResolvedValue(makeTransactionsPage([]));
    mockInvestmentsHoldingsGet.mockResolvedValue(makeHoldingsResponse([], []));

    await updateInvestments('user-123', 'item-abc');

    expect(mockInvestmentsTransactionsGet).toHaveBeenCalledTimes(1);
    expect(mockInvestmentsHoldingsGet).toHaveBeenCalledTimes(1);
  });

  it('returns transactionsUpserted from syncTransactions result', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockInvestmentsTransactionsGet.mockResolvedValue(makeTransactionsPage([samplePlaidInvTx]));
    mockInvestmentsHoldingsGet.mockResolvedValue(makeHoldingsResponse([], []));
    mockUpsertInvestmentTransaction.mockResolvedValue(undefined);

    const result = await updateInvestments('user-123', 'item-abc');

    expect(result.transactionsUpserted).toBe(1);
  });

  it('returns holdingsUpserted from syncHoldings result', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockInvestmentsTransactionsGet.mockResolvedValue(makeTransactionsPage([]));
    mockInvestmentsHoldingsGet.mockResolvedValue(
      makeHoldingsResponse([samplePlaidHolding], [samplePlaidSecurity]),
    );
    mockUpsertHolding.mockResolvedValue(undefined);

    const result = await updateInvestments('user-123', 'item-abc');

    expect(result.holdingsUpserted).toBe(1);
  });

  it('returns snapshotDate from syncHoldings result in YYYY-MM-DD format', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockInvestmentsTransactionsGet.mockResolvedValue(makeTransactionsPage([]));
    mockInvestmentsHoldingsGet.mockResolvedValue(makeHoldingsResponse([], []));

    const result = await updateInvestments('user-123', 'item-abc');

    expect(result.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// Read delegates
// ---------------------------------------------------------------------------

describe('getLatestHoldings', () => {
  it('delegates to repository getLatestHoldingsByUser with the provided userId', async () => {
    mockGetLatestHoldingsByUser.mockResolvedValue([sampleHolding]);
    const result = await getLatestHoldings('user-123');
    expect(mockGetLatestHoldingsByUser).toHaveBeenCalledWith('user-123');
    expect(result).toEqual([sampleHolding]);
  });
});

describe('getHoldingsOnDate', () => {
  it('delegates to repository getHoldingsBySnapshotDate with userId and date', async () => {
    mockGetHoldingsBySnapshotDate.mockResolvedValue([sampleHolding]);
    const result = await getHoldingsOnDate('user-123', '2025-01-15');
    expect(mockGetHoldingsBySnapshotDate).toHaveBeenCalledWith('user-123', '2025-01-15');
    expect(result).toEqual([sampleHolding]);
  });
});

describe('getHoldingsSince', () => {
  it('delegates to repository getHoldingsSince with userId and sinceDate', async () => {
    mockGetHoldingsSince.mockResolvedValue([sampleHolding]);
    const result = await getHoldingsSince('user-123', '2025-01-01');
    expect(mockGetHoldingsSince).toHaveBeenCalledWith('user-123', '2025-01-01');
    expect(result).toEqual([sampleHolding]);
  });
});

describe('getTransactionsSince', () => {
  it('delegates to repository getInvestmentTransactionsSince with userId and sinceDate', async () => {
    mockGetInvestmentTransactionsSince.mockResolvedValue([sampleInvestmentTransaction]);
    const result = await getTransactionsSince('user-123', '2025-01-01');
    expect(mockGetInvestmentTransactionsSince).toHaveBeenCalledWith('user-123', '2025-01-01');
    expect(result).toEqual([sampleInvestmentTransaction]);
  });
});

describe('getTransactionsInRange', () => {
  it('delegates to repository getInvestmentTransactionsInRange with userId, startDate, and endDate', async () => {
    mockGetInvestmentTransactionsInRange.mockResolvedValue([sampleInvestmentTransaction]);
    const result = await getTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    expect(mockGetInvestmentTransactionsInRange).toHaveBeenCalledWith('user-123', '2025-01-01', '2025-01-31');
    expect(result).toEqual([sampleInvestmentTransaction]);
  });
});
