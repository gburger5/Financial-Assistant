/**
 * @module accounts.repository.test
 * @description Unit tests for the Accounts DynamoDB repository.
 * The AWS SDK `db` client is fully mocked — no real DynamoDB is hit.
 * Each test verifies the correct command type and input fields are sent.
 *
 * Accounts table schema:
 *   PK: userId (HASH), SK: plaidAccountId (RANGE)
 *   GSI: itemId-index          — itemId (HASH), plaidAccountId (RANGE)
 *   GSI: plaidAccountId-index  — plaidAccountId (HASH)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted() executes before module imports, making mockSend available
// inside the vi.mock factory even though vi.mock is hoisted to the top.
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('../../../db/index.js', () => ({
  db: { send: mockSend },
}));

import {
  upsertAccount,
  getAccountsByUserId,
  getAccountsByItemId,
  getAccountByPlaidAccountId,
} from '../accounts.repository.js';
import type { Account } from '../accounts.types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleAccount: Account = {
  userId: 'user-123',
  plaidAccountId: 'plaid-acct-abc',
  itemId: 'item-xyz',
  name: 'Chase Checking',
  officialName: 'Chase Total Checking®',
  mask: '1234',
  type: 'depository',
  subtype: 'checking',
  currentBalance: 1500.0,
  availableBalance: 1450.0,
  limitBalance: null,
  isoCurrencyCode: 'USD',
  unofficialCurrencyCode: null,
  updatedAt: '2024-01-01T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z',
};

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// upsertAccount
// ---------------------------------------------------------------------------

describe('upsertAccount', () => {
  it('uses UpdateCommand (not PutCommand) so partial field updates are safe', async () => {
    mockSend.mockResolvedValue({});
    await upsertAccount(sampleAccount);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.UpdateExpression).toBeDefined();
    expect(cmd.input.Item).toBeUndefined();
  });

  it('targets the Accounts table', async () => {
    mockSend.mockResolvedValue({});
    await upsertAccount(sampleAccount);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Accounts');
  });

  it('uses the composite key { userId, plaidAccountId }', async () => {
    mockSend.mockResolvedValue({});
    await upsertAccount(sampleAccount);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Key).toEqual({ userId: 'user-123', plaidAccountId: 'plaid-acct-abc' });
  });

  it('sets createdAt with if_not_exists so existing timestamps are preserved on re-sync', async () => {
    mockSend.mockResolvedValue({});
    await upsertAccount(sampleAccount);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.UpdateExpression).toMatch(/if_not_exists\(createdAt/);
  });

  it('includes the account updatedAt value in the expression', async () => {
    mockSend.mockResolvedValue({});
    await upsertAccount(sampleAccount);
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain(sampleAccount.updatedAt);
  });

  it('returns void on success', async () => {
    mockSend.mockResolvedValue({});
    const result = await upsertAccount(sampleAccount);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAccountsByUserId
// ---------------------------------------------------------------------------

describe('getAccountsByUserId', () => {
  it('returns an empty array when Items is an empty array', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await getAccountsByUserId('user-123');
    expect(result).toEqual([]);
  });

  it('returns an empty array when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await getAccountsByUserId('user-123');
    expect(result).toEqual([]);
  });

  it('returns all accounts for the user', async () => {
    mockSend.mockResolvedValue({ Items: [sampleAccount] });
    const result = await getAccountsByUserId('user-123');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(sampleAccount);
  });

  it('queries the Accounts base table (no IndexName)', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getAccountsByUserId('user-123');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Accounts');
    expect(cmd.input.IndexName).toBeUndefined();
  });

  it('filters by the userId value provided', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getAccountsByUserId('user-123');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('user-123');
  });
});

// ---------------------------------------------------------------------------
// getAccountsByItemId
// ---------------------------------------------------------------------------

describe('getAccountsByItemId', () => {
  it('returns an empty array when Items is an empty array', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await getAccountsByItemId('item-xyz');
    expect(result).toEqual([]);
  });

  it('returns an empty array when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await getAccountsByItemId('item-xyz');
    expect(result).toEqual([]);
  });

  it('returns all accounts for the item', async () => {
    mockSend.mockResolvedValue({ Items: [sampleAccount] });
    const result = await getAccountsByItemId('item-xyz');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(sampleAccount);
  });

  it('queries the itemId-index GSI on the Accounts table', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getAccountsByItemId('item-xyz');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Accounts');
    expect(cmd.input.IndexName).toBe('itemId-index');
  });

  it('filters by the itemId value provided', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getAccountsByItemId('item-xyz');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('item-xyz');
  });
});

// ---------------------------------------------------------------------------
// getAccountByPlaidAccountId
// ---------------------------------------------------------------------------

describe('getAccountByPlaidAccountId', () => {
  it('returns null when Items is an empty array', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await getAccountByPlaidAccountId('plaid-acct-abc');
    expect(result).toBeNull();
  });

  it('returns null when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await getAccountByPlaidAccountId('plaid-acct-abc');
    expect(result).toBeNull();
  });

  it('returns the first matching account when found', async () => {
    mockSend.mockResolvedValue({ Items: [sampleAccount] });
    const result = await getAccountByPlaidAccountId('plaid-acct-abc');
    expect(result).toEqual(sampleAccount);
  });

  it('queries the plaidAccountId-index GSI on the Accounts table', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getAccountByPlaidAccountId('plaid-acct-abc');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Accounts');
    expect(cmd.input.IndexName).toBe('plaidAccountId-index');
  });

  it('filters by the plaidAccountId value provided', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getAccountByPlaidAccountId('plaid-acct-abc');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('plaid-acct-abc');
  });
});
