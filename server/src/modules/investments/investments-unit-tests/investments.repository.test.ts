/**
 * @module investments.repository.test
 * @description Unit tests for the Investments DynamoDB repository.
 * The AWS SDK `db` client is fully mocked — no real DynamoDB is hit.
 * Each test verifies the correct command type and input fields are sent.
 *
 * InvestmentTransactions table schema:
 *   PK: userId (HASH), SK: dateTransactionId (RANGE) — "date#investment_transaction_id"
 *   GSI: plaidInvestmentTransactionId-index
 *
 * Holdings table schema:
 *   PK: userId (HASH), SK: snapshotDateAccountSecurity (RANGE)
 *                       — "snapshotDate#accountId#securityId"
 *   GSI: plaidAccountId-index
 *
 * DynamoDB reserved-word note:
 *   "name" is a reserved word in DynamoDB expression syntax.
 *   The repository must alias it as #name in ExpressionAttributeNames.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted() executes before module imports, making mockSend available
// inside the vi.mock factory even though vi.mock is hoisted to the top.
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('../../../db/index.js', () => ({
  db: { send: mockSend },
}));

import {
  upsertInvestmentTransaction,
  getInvestmentTransactionsSince,
  getInvestmentTransactionsInRange,
  upsertHolding,
  getLatestHoldingsByUser,
  getHoldingsBySnapshotDate,
  getHoldingsSince,
  getAllHoldingsByUser,
  getHoldingsByAccountId,
} from '../investments.repository.js';
import type { InvestmentTransaction, Holding } from '../investments.types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// upsertInvestmentTransaction
// ---------------------------------------------------------------------------

describe('upsertInvestmentTransaction', () => {
  it('uses UpdateCommand (not PutCommand) so fields are preserved on re-sync', async () => {
    mockSend.mockResolvedValue({});
    await upsertInvestmentTransaction(sampleInvestmentTransaction);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.UpdateExpression).toBeDefined();
    expect(cmd.input.Item).toBeUndefined();
  });

  it('targets the InvestmentTransactions table', async () => {
    mockSend.mockResolvedValue({});
    await upsertInvestmentTransaction(sampleInvestmentTransaction);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('InvestmentTransactions');
  });

  it('uses the composite key { userId, dateTransactionId }', async () => {
    mockSend.mockResolvedValue({});
    await upsertInvestmentTransaction(sampleInvestmentTransaction);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Key).toEqual({
      userId: 'user-123',
      dateTransactionId: '2025-01-15#inv-txn-abc',
    });
  });

  it('uses if_not_exists(createdAt) to preserve the original creation timestamp on re-sync', async () => {
    mockSend.mockResolvedValue({});
    await upsertInvestmentTransaction(sampleInvestmentTransaction);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.UpdateExpression).toMatch(/if_not_exists\(createdAt/);
  });

  it('aliases #name to "name" in ExpressionAttributeNames because "name" is a DynamoDB reserved word', async () => {
    mockSend.mockResolvedValue({});
    await upsertInvestmentTransaction(sampleInvestmentTransaction);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeNames?.['#name']).toBe('name');
  });

  it('includes investmentTransactionId in ExpressionAttributeValues', async () => {
    mockSend.mockResolvedValue({});
    await upsertInvestmentTransaction(sampleInvestmentTransaction);
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('inv-txn-abc');
  });

  it('includes updatedAt in ExpressionAttributeValues', async () => {
    mockSend.mockResolvedValue({});
    await upsertInvestmentTransaction(sampleInvestmentTransaction);
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain(sampleInvestmentTransaction.updatedAt);
  });

  it('includes plaidAccountId in ExpressionAttributeValues', async () => {
    mockSend.mockResolvedValue({});
    await upsertInvestmentTransaction(sampleInvestmentTransaction);
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('acct-xyz');
  });

  it('returns void on success', async () => {
    mockSend.mockResolvedValue({});
    const result = await upsertInvestmentTransaction(sampleInvestmentTransaction);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getInvestmentTransactionsSince
// ---------------------------------------------------------------------------

describe('getInvestmentTransactionsSince', () => {
  it('returns an empty array when Items is an empty array', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await getInvestmentTransactionsSince('user-123', '2025-01-01');
    expect(result).toEqual([]);
  });

  it('returns an empty array when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await getInvestmentTransactionsSince('user-123', '2025-01-01');
    expect(result).toEqual([]);
  });

  it('returns all matching transactions when found', async () => {
    mockSend.mockResolvedValue({ Items: [sampleInvestmentTransaction] });
    const result = await getInvestmentTransactionsSince('user-123', '2025-01-01');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(sampleInvestmentTransaction);
  });

  it('queries the InvestmentTransactions base table (no IndexName)', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getInvestmentTransactionsSince('user-123', '2025-01-01');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('InvestmentTransactions');
    expect(cmd.input.IndexName).toBeUndefined();
  });

  it('filters by the provided userId', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getInvestmentTransactionsSince('user-123', '2025-01-01');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('user-123');
  });

  it('uses sinceDate as the lower BETWEEN bound', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getInvestmentTransactionsSince('user-123', '2025-01-01');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('2025-01-01');
  });

  it('uses "9999-12-31#~" as the upper BETWEEN bound to capture all future dates', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getInvestmentTransactionsSince('user-123', '2025-01-01');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('9999-12-31#~');
  });

  it('uses a KeyConditionExpression with BETWEEN for the sort key range', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getInvestmentTransactionsSince('user-123', '2025-01-01');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.KeyConditionExpression).toMatch(/BETWEEN/i);
  });
});

// ---------------------------------------------------------------------------
// getInvestmentTransactionsInRange
// ---------------------------------------------------------------------------

describe('getInvestmentTransactionsInRange', () => {
  it('returns an empty array when Items is an empty array', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await getInvestmentTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    expect(result).toEqual([]);
  });

  it('returns an empty array when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await getInvestmentTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    expect(result).toEqual([]);
  });

  it('returns all matching transactions when found', async () => {
    mockSend.mockResolvedValue({ Items: [sampleInvestmentTransaction] });
    const result = await getInvestmentTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(sampleInvestmentTransaction);
  });

  it('queries the InvestmentTransactions base table (no IndexName)', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getInvestmentTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('InvestmentTransactions');
    expect(cmd.input.IndexName).toBeUndefined();
  });

  it('filters by the provided userId', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getInvestmentTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('user-123');
  });

  it('uses startDate as the lower BETWEEN bound', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getInvestmentTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('2025-01-01');
  });

  it('uses endDate + "#~" as the upper BETWEEN bound to capture all transactions on the end date', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getInvestmentTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('2025-01-31#~');
  });

  it('uses a KeyConditionExpression with BETWEEN for the sort key range', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getInvestmentTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.KeyConditionExpression).toMatch(/BETWEEN/i);
  });
});

// ---------------------------------------------------------------------------
// upsertHolding
// ---------------------------------------------------------------------------

describe('upsertHolding', () => {
  it('uses UpdateCommand (not PutCommand) so fields are preserved on re-sync', async () => {
    mockSend.mockResolvedValue({});
    await upsertHolding(sampleHolding);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.UpdateExpression).toBeDefined();
    expect(cmd.input.Item).toBeUndefined();
  });

  it('targets the Holdings table', async () => {
    mockSend.mockResolvedValue({});
    await upsertHolding(sampleHolding);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Holdings');
  });

  it('uses the composite key { userId, snapshotDateAccountSecurity }', async () => {
    mockSend.mockResolvedValue({});
    await upsertHolding(sampleHolding);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Key).toEqual({
      userId: 'user-123',
      snapshotDateAccountSecurity: '2025-01-15#acct-xyz#sec-123',
    });
  });

  it('uses if_not_exists(createdAt) to preserve the original creation timestamp on re-sync', async () => {
    mockSend.mockResolvedValue({});
    await upsertHolding(sampleHolding);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.UpdateExpression).toMatch(/if_not_exists\(createdAt/);
  });

  it('includes plaidAccountId in ExpressionAttributeValues', async () => {
    mockSend.mockResolvedValue({});
    await upsertHolding(sampleHolding);
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('acct-xyz');
  });

  it('includes snapshotDate in ExpressionAttributeValues', async () => {
    mockSend.mockResolvedValue({});
    await upsertHolding(sampleHolding);
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('2025-01-15');
  });

  it('includes updatedAt in ExpressionAttributeValues', async () => {
    mockSend.mockResolvedValue({});
    await upsertHolding(sampleHolding);
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain(sampleHolding.updatedAt);
  });

  it('returns void on success', async () => {
    mockSend.mockResolvedValue({});
    const result = await upsertHolding(sampleHolding);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getLatestHoldingsByUser
// ---------------------------------------------------------------------------

describe('getLatestHoldingsByUser', () => {
  it('returns an empty array when no holdings exist', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const result = await getLatestHoldingsByUser('user-123');
    expect(result).toEqual([]);
  });

  it('returns an empty array when the step-1 response has no Items field', async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await getLatestHoldingsByUser('user-123');
    expect(result).toEqual([]);
  });

  it('issues two queries — one to get the latest date, one to get all holdings on that date', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ snapshotDate: '2025-01-15' }] })
      .mockResolvedValueOnce({ Items: [sampleHolding] });
    await getLatestHoldingsByUser('user-123');
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('queries the Holdings table in step 1 with ScanIndexForward: false to get the most recent item first', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ snapshotDate: '2025-01-15' }] })
      .mockResolvedValueOnce({ Items: [sampleHolding] });
    await getLatestHoldingsByUser('user-123');
    const step1 = mockSend.mock.calls[0][0];
    expect(step1.input.TableName).toBe('Holdings');
    expect(step1.input.ScanIndexForward).toBe(false);
  });

  it('uses Limit: 1 in step 1 to minimise data transfer', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ snapshotDate: '2025-01-15' }] })
      .mockResolvedValueOnce({ Items: [sampleHolding] });
    await getLatestHoldingsByUser('user-123');
    const step1 = mockSend.mock.calls[0][0];
    expect(step1.input.Limit).toBe(1);
  });

  it('projects only snapshotDate in step 1 to minimise data transfer', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ snapshotDate: '2025-01-15' }] })
      .mockResolvedValueOnce({ Items: [sampleHolding] });
    await getLatestHoldingsByUser('user-123');
    const step1 = mockSend.mock.calls[0][0];
    expect(step1.input.ProjectionExpression).toBe('snapshotDate');
  });

  it('uses the latest snapshotDate as the BETWEEN lower bound in step 2', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ snapshotDate: '2025-01-15' }] })
      .mockResolvedValueOnce({ Items: [sampleHolding] });
    await getLatestHoldingsByUser('user-123');
    const step2 = mockSend.mock.calls[1][0];
    const values = Object.values(step2.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('2025-01-15');
  });

  it('uses snapshotDate + "#~" as the BETWEEN upper bound in step 2', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ snapshotDate: '2025-01-15' }] })
      .mockResolvedValueOnce({ Items: [sampleHolding] });
    await getLatestHoldingsByUser('user-123');
    const step2 = mockSend.mock.calls[1][0];
    const values = Object.values(step2.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('2025-01-15#~');
  });

  it('returns all holdings from the latest snapshot', async () => {
    const holding2: Holding = { ...sampleHolding, snapshotDateAccountSecurity: '2025-01-15#acct-xyz#sec-456', securityId: 'sec-456' };
    mockSend
      .mockResolvedValueOnce({ Items: [{ snapshotDate: '2025-01-15' }] })
      .mockResolvedValueOnce({ Items: [sampleHolding, holding2] });
    const result = await getLatestHoldingsByUser('user-123');
    expect(result).toHaveLength(2);
  });

  it('only issues one query and returns [] when step 1 finds no items (no step 2)', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    await getLatestHoldingsByUser('user-123');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getHoldingsBySnapshotDate
// ---------------------------------------------------------------------------

describe('getHoldingsBySnapshotDate', () => {
  it('returns an empty array when Items is an empty array', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await getHoldingsBySnapshotDate('user-123', '2025-01-15');
    expect(result).toEqual([]);
  });

  it('returns an empty array when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await getHoldingsBySnapshotDate('user-123', '2025-01-15');
    expect(result).toEqual([]);
  });

  it('returns all holdings for the given snapshot date', async () => {
    mockSend.mockResolvedValue({ Items: [sampleHolding] });
    const result = await getHoldingsBySnapshotDate('user-123', '2025-01-15');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(sampleHolding);
  });

  it('queries the Holdings base table (no IndexName)', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getHoldingsBySnapshotDate('user-123', '2025-01-15');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Holdings');
    expect(cmd.input.IndexName).toBeUndefined();
  });

  it('filters by the provided userId', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getHoldingsBySnapshotDate('user-123', '2025-01-15');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('user-123');
  });

  it('uses snapshotDate as the lower BETWEEN bound', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getHoldingsBySnapshotDate('user-123', '2025-01-15');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('2025-01-15');
  });

  it('uses snapshotDate + "#~" as the upper BETWEEN bound to capture all accounts/securities on that date', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getHoldingsBySnapshotDate('user-123', '2025-01-15');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('2025-01-15#~');
  });

  it('uses a KeyConditionExpression with BETWEEN', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getHoldingsBySnapshotDate('user-123', '2025-01-15');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.KeyConditionExpression).toMatch(/BETWEEN/i);
  });
});

// ---------------------------------------------------------------------------
// getHoldingsSince
// ---------------------------------------------------------------------------

describe('getHoldingsSince', () => {
  it('returns an empty array when Items is an empty array', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await getHoldingsSince('user-123', '2025-01-01');
    expect(result).toEqual([]);
  });

  it('returns an empty array when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await getHoldingsSince('user-123', '2025-01-01');
    expect(result).toEqual([]);
  });

  it('returns all holdings on or after sinceDate across all snapshots', async () => {
    mockSend.mockResolvedValue({ Items: [sampleHolding] });
    const result = await getHoldingsSince('user-123', '2025-01-01');
    expect(result).toHaveLength(1);
  });

  it('queries the Holdings base table (no IndexName)', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getHoldingsSince('user-123', '2025-01-01');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Holdings');
    expect(cmd.input.IndexName).toBeUndefined();
  });

  it('filters by the provided userId', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getHoldingsSince('user-123', '2025-01-01');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('user-123');
  });

  it('uses sinceDate as the lower BETWEEN bound', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getHoldingsSince('user-123', '2025-01-01');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('2025-01-01');
  });

  it('uses "9999-12-31#~" as the upper BETWEEN bound to capture all future snapshots', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getHoldingsSince('user-123', '2025-01-01');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('9999-12-31#~');
  });
});

// ---------------------------------------------------------------------------
// getAllHoldingsByUser
// ---------------------------------------------------------------------------

describe('getAllHoldingsByUser', () => {
  it('returns an empty array when Items is an empty array', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await getAllHoldingsByUser('user-123');
    expect(result).toEqual([]);
  });

  it('returns an empty array when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await getAllHoldingsByUser('user-123');
    expect(result).toEqual([]);
  });

  it('returns all holdings across all snapshots for the user', async () => {
    mockSend.mockResolvedValue({ Items: [sampleHolding] });
    const result = await getAllHoldingsByUser('user-123');
    expect(result).toHaveLength(1);
  });

  it('queries the Holdings base table (no IndexName)', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getAllHoldingsByUser('user-123');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Holdings');
    expect(cmd.input.IndexName).toBeUndefined();
  });

  it('filters by the provided userId with a KeyConditionExpression', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getAllHoldingsByUser('user-123');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('user-123');
    expect(cmd.input.KeyConditionExpression).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getHoldingsByAccountId
// ---------------------------------------------------------------------------

describe('getHoldingsByAccountId', () => {
  it('returns an empty array when Items is an empty array', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await getHoldingsByAccountId('acct-xyz');
    expect(result).toEqual([]);
  });

  it('returns an empty array when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await getHoldingsByAccountId('acct-xyz');
    expect(result).toEqual([]);
  });

  it('returns all holdings for the given account across all snapshots', async () => {
    mockSend.mockResolvedValue({ Items: [sampleHolding] });
    const result = await getHoldingsByAccountId('acct-xyz');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(sampleHolding);
  });

  it('queries the plaidAccountId-index GSI on the Holdings table', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getHoldingsByAccountId('acct-xyz');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Holdings');
    expect(cmd.input.IndexName).toBe('plaidAccountId-index');
  });

  it('filters by the provided plaidAccountId', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getHoldingsByAccountId('acct-xyz');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('acct-xyz');
  });
});
