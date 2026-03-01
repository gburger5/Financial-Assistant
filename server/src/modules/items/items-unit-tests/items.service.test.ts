/**
 * @module items.service.test
 * @description Unit tests for items business logic.
 * The repository and encryption module are fully mocked — no DynamoDB or real crypto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../items.repository.js', () => ({
  saveItem: vi.fn(),
  getItemsByUserId: vi.fn(),
  getItemByItemId: vi.fn(),
  updateTransactionCursor: vi.fn(),
  markItemBad: vi.fn(),
  markItemActive: vi.fn(),
}));

// Encrypt returns "enc:<plaintext>"; decrypt strips the prefix.
// This gives us deterministic values we can assert on without running real AES.
vi.mock('../../../lib/encryption.js', () => ({
  encrypt: vi.fn((text: string) => `enc:${text}`),
  decrypt: vi.fn((text: string) => text.replace(/^enc:/, '')),
}));

import {
  linkItem,
  getItemsForUser,
  getItemForSync,
  updateCursor,
  handleLoginRequired,
  restoreItem,
} from '../items.service.js';
import * as repo from '../items.repository.js';
import { ConflictError, NotFoundError } from '../../../lib/errors.js';
import type { PlaidItem, CreatePlaidItemInput } from '../items.types.js';

const mockSaveItem = vi.mocked(repo.saveItem);
const mockGetItemsByUserId = vi.mocked(repo.getItemsByUserId);
const mockGetItemByItemId = vi.mocked(repo.getItemByItemId);
const mockUpdateTransactionCursor = vi.mocked(repo.updateTransactionCursor);
const mockMarkItemBad = vi.mocked(repo.markItemBad);
const mockMarkItemActive = vi.mocked(repo.markItemActive);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleInput: CreatePlaidItemInput = {
  userId: 'user-123',
  itemId: 'item-abc',
  encryptedAccessToken: 'enc:real-token',
  institutionId: 'ins-1',
  institutionName: 'Test Bank',
};

const sampleItem: PlaidItem = {
  userId: 'user-123',
  itemId: 'item-abc',
  encryptedAccessToken: 'enc:real-token',
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
// linkItem
// ---------------------------------------------------------------------------

describe('linkItem', () => {
  it('calls saveItem with the provided input', async () => {
    mockSaveItem.mockResolvedValue(sampleItem);
    await linkItem(sampleInput);
    expect(mockSaveItem).toHaveBeenCalledWith(sampleInput);
  });

  it('returns the saved item on success', async () => {
    mockSaveItem.mockResolvedValue(sampleItem);
    const result = await linkItem(sampleInput);
    expect(result).toEqual(sampleItem);
  });

  it('throws ConflictError when the repository returns null (duplicate item)', async () => {
    mockSaveItem.mockResolvedValue(null);
    await expect(linkItem(sampleInput)).rejects.toThrow(ConflictError);
  });

  it('throws ConflictError with "Item already linked" message', async () => {
    mockSaveItem.mockResolvedValue(null);
    await expect(linkItem(sampleInput)).rejects.toThrow('Item already linked');
  });
});

// ---------------------------------------------------------------------------
// getItemsForUser
// ---------------------------------------------------------------------------

describe('getItemsForUser', () => {
  it('calls getItemsByUserId with the userId', async () => {
    mockGetItemsByUserId.mockResolvedValue([]);
    await getItemsForUser('user-123');
    expect(mockGetItemsByUserId).toHaveBeenCalledWith('user-123');
  });

  it('returns an empty array when the user has no items', async () => {
    mockGetItemsByUserId.mockResolvedValue([]);
    const result = await getItemsForUser('user-123');
    expect(result).toEqual([]);
  });

  it('decrypts encryptedAccessToken and exposes it as accessToken', async () => {
    mockGetItemsByUserId.mockResolvedValue([sampleItem]);
    const result = await getItemsForUser('user-123');
    expect(result[0].accessToken).toBe('real-token');
  });

  it('strips encryptedAccessToken from the returned objects', async () => {
    mockGetItemsByUserId.mockResolvedValue([sampleItem]);
    const result = await getItemsForUser('user-123');
    expect(result[0]).not.toHaveProperty('encryptedAccessToken');
  });

  it('preserves all other item fields alongside accessToken', async () => {
    mockGetItemsByUserId.mockResolvedValue([sampleItem]);
    const result = await getItemsForUser('user-123');
    expect(result[0].userId).toBe('user-123');
    expect(result[0].itemId).toBe('item-abc');
    expect(result[0].status).toBe('active');
    expect(result[0].institutionName).toBe('Test Bank');
  });

  it('decrypts tokens for multiple items independently', async () => {
    const secondItem: PlaidItem = {
      ...sampleItem,
      itemId: 'item-def',
      encryptedAccessToken: 'enc:second-token',
    };
    mockGetItemsByUserId.mockResolvedValue([sampleItem, secondItem]);
    const result = await getItemsForUser('user-123');
    expect(result[0].accessToken).toBe('real-token');
    expect(result[1].accessToken).toBe('second-token');
  });
});

// ---------------------------------------------------------------------------
// getItemForSync
// ---------------------------------------------------------------------------

describe('getItemForSync', () => {
  it('calls getItemByItemId with the itemId', async () => {
    mockGetItemByItemId.mockResolvedValue(sampleItem);
    await getItemForSync('item-abc');
    expect(mockGetItemByItemId).toHaveBeenCalledWith('item-abc');
  });

  it('throws NotFoundError when the item does not exist', async () => {
    mockGetItemByItemId.mockResolvedValue(null);
    await expect(getItemForSync('item-abc')).rejects.toThrow(NotFoundError);
  });

  it('decrypts encryptedAccessToken and exposes it as accessToken', async () => {
    mockGetItemByItemId.mockResolvedValue(sampleItem);
    const result = await getItemForSync('item-abc');
    expect(result.accessToken).toBe('real-token');
  });

  it('strips encryptedAccessToken from the returned object', async () => {
    mockGetItemByItemId.mockResolvedValue(sampleItem);
    const result = await getItemForSync('item-abc');
    expect(result).not.toHaveProperty('encryptedAccessToken');
  });

  it('preserves all other item fields alongside accessToken', async () => {
    mockGetItemByItemId.mockResolvedValue(sampleItem);
    const result = await getItemForSync('item-abc');
    expect(result.userId).toBe('user-123');
    expect(result.itemId).toBe('item-abc');
    expect(result.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// updateCursor
// ---------------------------------------------------------------------------

describe('updateCursor', () => {
  it('calls updateTransactionCursor with itemId and cursor', async () => {
    mockUpdateTransactionCursor.mockResolvedValue(undefined);
    await updateCursor('item-abc', 'cursor-xyz');
    expect(mockUpdateTransactionCursor).toHaveBeenCalledWith('item-abc', 'cursor-xyz');
  });

  it('returns void', async () => {
    mockUpdateTransactionCursor.mockResolvedValue(undefined);
    const result = await updateCursor('item-abc', 'cursor-xyz');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handleLoginRequired
// ---------------------------------------------------------------------------

describe('handleLoginRequired', () => {
  it('calls markItemBad with the itemId', async () => {
    mockMarkItemBad.mockResolvedValue(undefined);
    await handleLoginRequired('item-abc');
    expect(mockMarkItemBad).toHaveBeenCalledWith('item-abc');
  });

  it('returns void', async () => {
    mockMarkItemBad.mockResolvedValue(undefined);
    const result = await handleLoginRequired('item-abc');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// restoreItem
// ---------------------------------------------------------------------------

describe('restoreItem', () => {
  it('calls markItemActive with the itemId', async () => {
    mockMarkItemActive.mockResolvedValue(undefined);
    await restoreItem('item-abc');
    expect(mockMarkItemActive).toHaveBeenCalledWith('item-abc');
  });

  it('returns void', async () => {
    mockMarkItemActive.mockResolvedValue(undefined);
    const result = await restoreItem('item-abc');
    expect(result).toBeUndefined();
  });
});
