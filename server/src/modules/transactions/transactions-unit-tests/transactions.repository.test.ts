/**
 * @module transactions.repository.test
 * @description Unit tests for the Transactions DynamoDB repository.
 * The AWS SDK `db` client is fully mocked — no real DynamoDB is hit.
 * Each test verifies the correct command type and input fields are sent.
 *
 * Transactions table schema:
 *   PK: userId (HASH), SK: sortKey (RANGE) — sortKey is "date#plaidTransactionId"
 *   GSI: plaidTransactionId-index  — plaidTransactionId (HASH)
 *   GSI: accountId-date-index
 *
 * DynamoDB reserved-word note:
 *   "date" and "name" are reserved words in DynamoDB expression syntax.
 *   The repository must alias them as #date and #name in ExpressionAttributeNames.
 *   Forgetting this causes a silent validation error at runtime.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted() executes before module imports, making mockSend available
// inside the vi.mock factory even though vi.mock is hoisted to the top.
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('../../../db/index.js', () => ({
  db: { send: mockSend },
}));

import {
  upsertTransaction,
  deleteByPlaidTransactionId,
  getTransactionsSince,
  getTransactionsInRange,
} from '../transactions.repository.js';
import type { Transaction } from '../transactions.types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleTransaction: Transaction = {
  userId: 'user-123',
  sortKey: '2025-01-15#txn-abc',
  plaidTransactionId: 'txn-abc',
  plaidAccountId: 'acct-xyz',
  amount: 42.5,
  date: '2025-01-15',
  name: 'Starbucks',
  merchantName: 'Starbucks',
  category: 'FOOD_AND_DRINK',
  detailedCategory: 'FOOD_AND_DRINK_COFFEE',
  categoryIconUrl: 'https://plaid.com/categories/food.png',
  pending: false,
  isoCurrencyCode: 'USD',
  unofficialCurrencyCode: null,
  createdAt: '2025-01-15T10:00:00.000Z',
  updatedAt: '2025-01-15T10:00:00.000Z',
};

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// upsertTransaction
// ---------------------------------------------------------------------------

describe('upsertTransaction', () => {
  it('uses UpdateCommand (not PutCommand) so other fields are preserved on re-sync', async () => {
    mockSend.mockResolvedValue({});
    await upsertTransaction(sampleTransaction);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.UpdateExpression).toBeDefined();
    expect(cmd.input.Item).toBeUndefined();
  });

  it('targets the Transactions table', async () => {
    mockSend.mockResolvedValue({});
    await upsertTransaction(sampleTransaction);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Transactions');
  });

  it('uses the composite key { userId, sortKey }', async () => {
    mockSend.mockResolvedValue({});
    await upsertTransaction(sampleTransaction);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Key).toEqual({ userId: 'user-123', sortKey: '2025-01-15#txn-abc' });
  });

  it('uses if_not_exists(createdAt) to preserve the original creation timestamp on re-sync', async () => {
    mockSend.mockResolvedValue({});
    await upsertTransaction(sampleTransaction);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.UpdateExpression).toMatch(/if_not_exists\(createdAt/);
  });

  it('aliases #date to "date" in ExpressionAttributeNames because "date" is a DynamoDB reserved word', async () => {
    mockSend.mockResolvedValue({});
    await upsertTransaction(sampleTransaction);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeNames?.['#date']).toBe('date');
  });

  it('aliases #name to "name" in ExpressionAttributeNames because "name" is a DynamoDB reserved word', async () => {
    mockSend.mockResolvedValue({});
    await upsertTransaction(sampleTransaction);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeNames?.['#name']).toBe('name');
  });

  it('includes the transaction updatedAt in ExpressionAttributeValues', async () => {
    mockSend.mockResolvedValue({});
    await upsertTransaction(sampleTransaction);
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain(sampleTransaction.updatedAt);
  });

  it('includes the plaidTransactionId in ExpressionAttributeValues', async () => {
    mockSend.mockResolvedValue({});
    await upsertTransaction(sampleTransaction);
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('txn-abc');
  });

  it('includes the plaidAccountId in ExpressionAttributeValues', async () => {
    mockSend.mockResolvedValue({});
    await upsertTransaction(sampleTransaction);
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('acct-xyz');
  });

  it('returns void on success', async () => {
    mockSend.mockResolvedValue({});
    const result = await upsertTransaction(sampleTransaction);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deleteByPlaidTransactionId
// ---------------------------------------------------------------------------

describe('deleteByPlaidTransactionId', () => {
  it('queries the plaidTransactionId-index GSI as the first step', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ userId: 'user-123', sortKey: '2025-01-15#txn-abc' }] })
      .mockResolvedValueOnce({});
    await deleteByPlaidTransactionId('txn-abc');
    const queryCmd = mockSend.mock.calls[0][0];
    expect(queryCmd.input.TableName).toBe('Transactions');
    expect(queryCmd.input.IndexName).toBe('plaidTransactionId-index');
  });

  it('filters the GSI query by the provided plaidTransactionId', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ userId: 'user-123', sortKey: '2025-01-15#txn-abc' }] })
      .mockResolvedValueOnce({});
    await deleteByPlaidTransactionId('txn-abc');
    const queryCmd = mockSend.mock.calls[0][0];
    const values = Object.values(queryCmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('txn-abc');
  });

  it('uses ProjectionExpression on the GSI query to avoid deserializing the full item', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ userId: 'user-123', sortKey: '2025-01-15#txn-abc' }] })
      .mockResolvedValueOnce({});
    await deleteByPlaidTransactionId('txn-abc');
    const queryCmd = mockSend.mock.calls[0][0];
    expect(queryCmd.input.ProjectionExpression).toBeDefined();
    // Only the primary key fields should be projected
    expect(queryCmd.input.ProjectionExpression).toMatch(/userId/);
    expect(queryCmd.input.ProjectionExpression).toMatch(/sortKey/);
  });

  it('issues a DeleteCommand with the full composite key as the second step', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ userId: 'user-123', sortKey: '2025-01-15#txn-abc' }] })
      .mockResolvedValueOnce({});
    await deleteByPlaidTransactionId('txn-abc');
    const deleteCmd = mockSend.mock.calls[1][0];
    expect(deleteCmd.input.TableName).toBe('Transactions');
    expect(deleteCmd.input.Key).toEqual({ userId: 'user-123', sortKey: '2025-01-15#txn-abc' });
  });

  it('returns early without a DeleteCommand when the GSI finds no matching transaction', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    await deleteByPlaidTransactionId('txn-missing');
    // Only the GSI query was issued — no DeleteCommand
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('returns early without a DeleteCommand when the GSI response has no Items field', async () => {
    mockSend.mockResolvedValueOnce({});
    await deleteByPlaidTransactionId('txn-missing');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('returns void on successful delete', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ userId: 'user-123', sortKey: '2025-01-15#txn-abc' }] })
      .mockResolvedValueOnce({});
    const result = await deleteByPlaidTransactionId('txn-abc');
    expect(result).toBeUndefined();
  });

  it('returns void when no transaction was found (early return)', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const result = await deleteByPlaidTransactionId('txn-missing');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getTransactionsSince
// ---------------------------------------------------------------------------

describe('getTransactionsSince', () => {
  it('returns an empty array when Items is an empty array', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await getTransactionsSince('user-123', '2025-01-01');
    expect(result).toEqual([]);
  });

  it('returns an empty array when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await getTransactionsSince('user-123', '2025-01-01');
    expect(result).toEqual([]);
  });

  it('returns all matching transactions when found', async () => {
    mockSend.mockResolvedValue({ Items: [sampleTransaction] });
    const result = await getTransactionsSince('user-123', '2025-01-01');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(sampleTransaction);
  });

  it('queries the Transactions base table (no IndexName)', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getTransactionsSince('user-123', '2025-01-01');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Transactions');
    expect(cmd.input.IndexName).toBeUndefined();
  });

  it('filters by the provided userId', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getTransactionsSince('user-123', '2025-01-01');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('user-123');
  });

  it('uses sinceDate as the lower BETWEEN bound', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getTransactionsSince('user-123', '2025-01-01');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('2025-01-01');
  });

  it('uses "9999-12-31#~" as the upper BETWEEN bound to capture all dates in the future', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getTransactionsSince('user-123', '2025-01-01');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('9999-12-31#~');
  });

  it('uses a KeyConditionExpression with BETWEEN for the sort key range', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getTransactionsSince('user-123', '2025-01-01');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.KeyConditionExpression).toMatch(/BETWEEN/i);
  });
});

// ---------------------------------------------------------------------------
// getTransactionsInRange
// ---------------------------------------------------------------------------

describe('getTransactionsInRange', () => {
  it('returns an empty array when Items is an empty array', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await getTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    expect(result).toEqual([]);
  });

  it('returns an empty array when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await getTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    expect(result).toEqual([]);
  });

  it('returns all matching transactions when found', async () => {
    mockSend.mockResolvedValue({ Items: [sampleTransaction] });
    const result = await getTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(sampleTransaction);
  });

  it('queries the Transactions base table (no IndexName)', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Transactions');
    expect(cmd.input.IndexName).toBeUndefined();
  });

  it('filters by the provided userId', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('user-123');
  });

  it('uses startDate as the lower BETWEEN bound', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('2025-01-01');
  });

  it('uses endDate + "#~" as the upper BETWEEN bound to capture all transactions on the end date', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    // ~ has a high ASCII value so "2025-01-31#~" sorts after any transaction on that date
    expect(values).toContain('2025-01-31#~');
  });

  it('uses a KeyConditionExpression with BETWEEN for the sort key range', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.KeyConditionExpression).toMatch(/BETWEEN/i);
  });
});
