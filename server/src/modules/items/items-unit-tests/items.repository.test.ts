/**
 * @module items.repository.test
 * @description Unit tests for the PlaidItems DynamoDB repository.
 * The AWS SDK `db` client is fully mocked — no real DynamoDB is hit.
 * Each test verifies the correct command type and input fields are sent.
 *
 * PlaidItems table schema:
 *   PK: userId (HASH), SK: itemId (RANGE)
 *   GSI: itemId-index (itemId as HASH) — used for webhook lookups by itemId alone.
 *
 * Update methods (markItemBad, markItemActive, updateTransactionCursor) must
 * do a two-step operation: first query itemId-index to resolve the userId,
 * then issue an UpdateCommand with the full composite key { userId, itemId }.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted() executes before module imports, making mockSend available
// inside the vi.mock factory even though vi.mock is hoisted to the top.
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('../../../db/index.js', () => ({
  db: { send: mockSend },
}));

import {
  saveItem,
  getItemsByUserId,
  getItemByItemId,
  updateTransactionCursor,
  markItemBad,
  markItemActive,
} from '../items.repository.js';
import type { PlaidItem, CreatePlaidItemInput } from '../items.types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleInput: CreatePlaidItemInput = {
  userId: 'user-123',
  itemId: 'item-abc',
  encryptedAccessToken: 'enc-token-xyz',
  institutionId: 'ins-1',
  institutionName: 'Test Bank',
};

const sampleItem: PlaidItem = {
  userId: 'user-123',
  itemId: 'item-abc',
  encryptedAccessToken: 'enc-token-xyz',
  institutionId: 'ins-1',
  institutionName: 'Test Bank',
  status: 'active',
  transactionCursor: null,
  consentExpirationTime: null,
  linkedAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// saveItem
// ---------------------------------------------------------------------------

describe('saveItem', () => {
  it('sends a PutCommand to the PlaidItems table', async () => {
    mockSend.mockResolvedValue({});
    await saveItem(sampleInput);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('PlaidItems');
    expect(cmd.input.Item).toBeDefined();
  });

  it('sets status to "active" on creation', async () => {
    mockSend.mockResolvedValue({});
    await saveItem(sampleInput);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.status).toBe('active');
  });

  it('sets transactionCursor to null on creation', async () => {
    mockSend.mockResolvedValue({});
    await saveItem(sampleInput);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.transactionCursor).toBeNull();
  });

  it('sets linkedAt and updatedAt to current ISO timestamps', async () => {
    mockSend.mockResolvedValue({});
    const before = new Date().toISOString();
    await saveItem(sampleInput);
    const after = new Date().toISOString();
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.linkedAt >= before).toBe(true);
    expect(cmd.input.Item.linkedAt <= after).toBe(true);
    expect(cmd.input.Item.updatedAt >= before).toBe(true);
    expect(cmd.input.Item.updatedAt <= after).toBe(true);
  });

  it('uses ConditionExpression attribute_not_exists(itemId) to prevent duplicates', async () => {
    mockSend.mockResolvedValue({});
    await saveItem(sampleInput);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ConditionExpression).toBe('attribute_not_exists(itemId)');
  });

  it('returns null when DynamoDB throws ConditionalCheckFailedException', async () => {
    const err = new Error('ConditionalCheckFailedException');
    err.name = 'ConditionalCheckFailedException';
    mockSend.mockRejectedValue(err);
    const result = await saveItem(sampleInput);
    expect(result).toBeNull();
  });

  it('returns the saved PlaidItem on success', async () => {
    mockSend.mockResolvedValue({});
    const result = await saveItem(sampleInput);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe('user-123');
    expect(result?.itemId).toBe('item-abc');
    expect(result?.status).toBe('active');
    expect(result?.encryptedAccessToken).toBe('enc-token-xyz');
  });

  it('sets consentExpirationTime to null when not provided in input', async () => {
    mockSend.mockResolvedValue({});
    const result = await saveItem(sampleInput);
    expect(result?.consentExpirationTime).toBeNull();
  });

  it('sets consentExpirationTime from input when provided', async () => {
    mockSend.mockResolvedValue({});
    const inputWithConsent: CreatePlaidItemInput = {
      ...sampleInput,
      consentExpirationTime: '2025-01-01T00:00:00.000Z',
    };
    const result = await saveItem(inputWithConsent);
    expect(result?.consentExpirationTime).toBe('2025-01-01T00:00:00.000Z');
  });

  it('re-throws non-ConditionalCheckFailedException errors', async () => {
    const err = new Error('ProvisionedThroughputExceededException');
    err.name = 'ProvisionedThroughputExceededException';
    mockSend.mockRejectedValue(err);
    await expect(saveItem(sampleInput)).rejects.toThrow('ProvisionedThroughputExceededException');
  });

  it('uses PutCommand (not UpdateCommand) so the full item is written', async () => {
    mockSend.mockResolvedValue({});
    await saveItem(sampleInput);
    const cmd = mockSend.mock.calls[0][0];
    // PutCommand has Item; UpdateCommand has UpdateExpression
    expect(cmd.input.Item).toBeDefined();
    expect(cmd.input.UpdateExpression).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getItemsByUserId
// ---------------------------------------------------------------------------

describe('getItemsByUserId', () => {
  it('returns an empty array when Items is an empty array', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await getItemsByUserId('user-123');
    expect(result).toEqual([]);
  });

  it('returns an empty array when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await getItemsByUserId('user-123');
    expect(result).toEqual([]);
  });

  it('returns all items for the user', async () => {
    mockSend.mockResolvedValue({ Items: [sampleItem] });
    const result = await getItemsByUserId('user-123');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(sampleItem);
  });

  it('queries the PlaidItems table', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getItemsByUserId('user-123');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('PlaidItems');
  });

  it('filters by the userId value provided', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getItemsByUserId('user-123');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('user-123');
  });
});

// ---------------------------------------------------------------------------
// getItemByItemId
// ---------------------------------------------------------------------------

describe('getItemByItemId', () => {
  it('returns null when Items is an empty array', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await getItemByItemId('item-abc');
    expect(result).toBeNull();
  });

  it('returns null when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await getItemByItemId('item-abc');
    expect(result).toBeNull();
  });

  it('returns the first matching item when found', async () => {
    mockSend.mockResolvedValue({ Items: [sampleItem] });
    const result = await getItemByItemId('item-abc');
    expect(result).toEqual(sampleItem);
  });

  it('queries the itemId-index GSI on the PlaidItems table', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getItemByItemId('item-abc');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('PlaidItems');
    expect(cmd.input.IndexName).toBe('itemId-index');
  });

  it('filters by the itemId value provided', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getItemByItemId('item-abc');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('item-abc');
  });
});

// ---------------------------------------------------------------------------
// updateTransactionCursor
// ---------------------------------------------------------------------------

describe('updateTransactionCursor', () => {
  it('uses UpdateCommand (not PutCommand) so other fields are preserved', async () => {
    // First call: GSI lookup to resolve userId; second call: UpdateCommand
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    await updateTransactionCursor('item-abc', 'cursor-xyz');
    const updateCmd = mockSend.mock.calls[1][0];
    expect(updateCmd.input.UpdateExpression).toBeDefined();
    expect(updateCmd.input.Item).toBeUndefined();
  });

  it('targets the PlaidItems table with the full composite key', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    await updateTransactionCursor('item-abc', 'cursor-xyz');
    const updateCmd = mockSend.mock.calls[1][0];
    expect(updateCmd.input.TableName).toBe('PlaidItems');
    expect(updateCmd.input.Key).toEqual({ userId: 'user-123', itemId: 'item-abc' });
  });

  it('sets transactionCursor to the provided cursor value', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    await updateTransactionCursor('item-abc', 'cursor-xyz');
    const updateCmd = mockSend.mock.calls[1][0];
    const values = Object.values(updateCmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('cursor-xyz');
  });

  it('sets updatedAt to a current ISO timestamp', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    const before = new Date().toISOString();
    await updateTransactionCursor('item-abc', 'cursor-xyz');
    const after = new Date().toISOString();
    const updateCmd = mockSend.mock.calls[1][0];
    const values = Object.values(updateCmd.input.ExpressionAttributeValues as Record<string, unknown>);
    const timestamps = (values as string[]).filter(
      (v) => typeof v === 'string' && v >= before && v <= after,
    );
    expect(timestamps.length).toBeGreaterThanOrEqual(1);
  });

  it('returns void on success', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    const result = await updateTransactionCursor('item-abc', 'cursor-xyz');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// markItemBad
// ---------------------------------------------------------------------------

describe('markItemBad', () => {
  it('uses UpdateCommand (not PutCommand) so other fields are preserved', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    await markItemBad('item-abc');
    const updateCmd = mockSend.mock.calls[1][0];
    expect(updateCmd.input.UpdateExpression).toBeDefined();
    expect(updateCmd.input.Item).toBeUndefined();
  });

  it('targets the PlaidItems table with the full composite key', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    await markItemBad('item-abc');
    const updateCmd = mockSend.mock.calls[1][0];
    expect(updateCmd.input.TableName).toBe('PlaidItems');
    expect(updateCmd.input.Key).toEqual({ userId: 'user-123', itemId: 'item-abc' });
  });

  it('sets status to "bad"', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    await markItemBad('item-abc');
    const updateCmd = mockSend.mock.calls[1][0];
    const values = Object.values(updateCmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('bad');
  });

  it('sets updatedAt to a current ISO timestamp', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    const before = new Date().toISOString();
    await markItemBad('item-abc');
    const after = new Date().toISOString();
    const updateCmd = mockSend.mock.calls[1][0];
    const values = Object.values(updateCmd.input.ExpressionAttributeValues as Record<string, unknown>);
    const timestamps = (values as string[]).filter(
      (v) => typeof v === 'string' && v >= before && v <= after,
    );
    expect(timestamps.length).toBeGreaterThanOrEqual(1);
  });

  it('returns void', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    const result = await markItemBad('item-abc');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// markItemActive
// ---------------------------------------------------------------------------

describe('markItemActive', () => {
  it('uses UpdateCommand (not PutCommand) so other fields are preserved', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    await markItemActive('item-abc');
    const updateCmd = mockSend.mock.calls[1][0];
    expect(updateCmd.input.UpdateExpression).toBeDefined();
    expect(updateCmd.input.Item).toBeUndefined();
  });

  it('targets the PlaidItems table with the full composite key', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    await markItemActive('item-abc');
    const updateCmd = mockSend.mock.calls[1][0];
    expect(updateCmd.input.TableName).toBe('PlaidItems');
    expect(updateCmd.input.Key).toEqual({ userId: 'user-123', itemId: 'item-abc' });
  });

  it('sets status to "active"', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    await markItemActive('item-abc');
    const updateCmd = mockSend.mock.calls[1][0];
    const values = Object.values(updateCmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('active');
  });

  it('sets updatedAt to a current ISO timestamp', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    const before = new Date().toISOString();
    await markItemActive('item-abc');
    const after = new Date().toISOString();
    const updateCmd = mockSend.mock.calls[1][0];
    const values = Object.values(updateCmd.input.ExpressionAttributeValues as Record<string, unknown>);
    const timestamps = (values as string[]).filter(
      (v) => typeof v === 'string' && v >= before && v <= after,
    );
    expect(timestamps.length).toBeGreaterThanOrEqual(1);
  });

  it('returns void', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleItem] })
      .mockResolvedValueOnce({});
    const result = await markItemActive('item-abc');
    expect(result).toBeUndefined();
  });
});
