/**
 * @module plaid.service.test
 * @description Unit tests for plaid.service business logic.
 * The Plaid client, encryption module, items service, and all downstream sync
 * services are fully mocked — no real Plaid API calls, DynamoDB, or crypto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factories — must exist before vi.mock() factory functions run
// ---------------------------------------------------------------------------

const { mockItemPublicTokenExchange } = vi.hoisted(() => ({
  mockItemPublicTokenExchange: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks — declared before any import that triggers module evaluation
// ---------------------------------------------------------------------------

vi.mock('../../../lib/plaidClient.js', () => ({
  plaidClient: {
    itemPublicTokenExchange: mockItemPublicTokenExchange,
  },
}));

vi.mock('../../../lib/encryption.js', () => ({
  encrypt: vi.fn((text: string) => `enc:${text}`),
  decrypt: vi.fn((text: string) => text.replace(/^enc:/, '')),
}));

vi.mock('../../items/items.service.js', () => ({
  linkItem: vi.fn(),
}));

vi.mock('../../transactions/transactions.service.js', () => ({
  syncTransactions: vi.fn(),
}));

vi.mock('../../investments/investments.service.js', () => ({
  updateInvestments: vi.fn(),
}));

vi.mock('../../liabilities/liabilities.service.js', () => ({
  updateLiabilities: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (must come after vi.mock() calls)
// ---------------------------------------------------------------------------

import { linkBankAccount, triggerInitialSync } from '../plaid.service.js';
import * as itemsService from '../../items/items.service.js';
import * as txService from '../../transactions/transactions.service.js';
import * as investmentsService from '../../investments/investments.service.js';
import * as liabilitiesService from '../../liabilities/liabilities.service.js';

const mockLinkItem = vi.mocked(itemsService.linkItem);
const mockSyncTransactions = vi.mocked(txService.syncTransactions);
const mockUpdateInvestments = vi.mocked(investmentsService.updateInvestments);
const mockUpdateLiabilities = vi.mocked(liabilitiesService.updateLiabilities);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Plaid's itemPublicTokenExchange response shape. */
const fakeExchangeResponse = {
  data: {
    access_token: 'access-sandbox-abc',
    item_id: 'item-xyz',
    request_id: 'req-123',
  },
};

const fakePlaidItem = {
  userId: 'user-1',
  itemId: 'item-xyz',
  encryptedAccessToken: 'enc:access-sandbox-abc',
  institutionId: 'ins-1',
  institutionName: 'Test Bank',
  status: 'active' as const,
  transactionCursor: null,
  consentExpirationTime: null,
  linkedAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const fakeSyncResult = { addedCount: 0, modifiedCount: 0, removedCount: 0, nextCursor: '' };
const fakeInvestmentResult = { transactionsUpserted: 0, holdingsUpserted: 0, snapshotDate: '2024-01-01' };
const fakeLiabilityResult = { creditCount: 0, studentCount: 0, mortgageCount: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mockItemPublicTokenExchange.mockResolvedValue(fakeExchangeResponse);
  mockLinkItem.mockResolvedValue(fakePlaidItem);
  mockSyncTransactions.mockResolvedValue(fakeSyncResult);
  mockUpdateInvestments.mockResolvedValue(fakeInvestmentResult);
  mockUpdateLiabilities.mockResolvedValue(fakeLiabilityResult);
});

// ---------------------------------------------------------------------------
// linkBankAccount
// ---------------------------------------------------------------------------

describe('linkBankAccount', () => {
  it('calls itemPublicTokenExchange with the provided publicToken', async () => {
    await linkBankAccount('user-1', 'pub-token', 'ins-1', 'Test Bank');

    expect(mockItemPublicTokenExchange).toHaveBeenCalledWith({
      public_token: 'pub-token',
    });
  });

  it('encrypts the Plaid access token before passing it to linkItem', async () => {
    await linkBankAccount('user-1', 'pub-token', 'ins-1', 'Test Bank');

    // encrypt mock prepends "enc:" — so the stored value must start with "enc:"
    const call = mockLinkItem.mock.calls[0][0];
    expect(call.encryptedAccessToken).toBe('enc:access-sandbox-abc');
  });

  it('calls linkItem with userId, itemId, encrypted token, institutionId, and institutionName', async () => {
    await linkBankAccount('user-1', 'pub-token', 'ins-1', 'Test Bank');

    expect(mockLinkItem).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        itemId: 'item-xyz',
        encryptedAccessToken: 'enc:access-sandbox-abc',
        institutionId: 'ins-1',
        institutionName: 'Test Bank',
      }),
    );
  });

  it('returns an object with itemId from the Plaid exchange response', async () => {
    const result = await linkBankAccount('user-1', 'pub-token', 'ins-1', 'Test Bank');

    expect(result.itemId).toBe('item-xyz');
  });

  it('returns an object with a message string', async () => {
    const result = await linkBankAccount('user-1', 'pub-token', 'ins-1', 'Test Bank');

    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('propagates errors from itemPublicTokenExchange without swallowing them', async () => {
    mockItemPublicTokenExchange.mockRejectedValue(new Error('Plaid API unavailable'));

    await expect(linkBankAccount('user-1', 'pub-token', 'ins-1', 'Test Bank')).rejects.toThrow(
      'Plaid API unavailable',
    );
  });

  it('fires triggerInitialSync and eventually calls syncTransactions', async () => {
    await linkBankAccount('user-1', 'pub-token', 'ins-1', 'Test Bank');

    // Allow the fire-and-forget microtask queue to drain
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockSyncTransactions).toHaveBeenCalledWith('user-1', 'item-xyz');
  });

  it('fires triggerInitialSync and eventually calls updateInvestments', async () => {
    await linkBankAccount('user-1', 'pub-token', 'ins-1', 'Test Bank');

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockUpdateInvestments).toHaveBeenCalledWith('user-1', 'item-xyz');
  });
});

// ---------------------------------------------------------------------------
// triggerInitialSync
// ---------------------------------------------------------------------------

describe('triggerInitialSync', () => {
  it('calls syncTransactions with userId and itemId', async () => {
    await triggerInitialSync('user-1', 'item-xyz');

    expect(mockSyncTransactions).toHaveBeenCalledWith('user-1', 'item-xyz');
  });

  it('calls updateInvestments with userId and itemId', async () => {
    await triggerInitialSync('user-1', 'item-xyz');

    expect(mockUpdateInvestments).toHaveBeenCalledWith('user-1', 'item-xyz');
  });

  it('calls updateLiabilities with itemId only', async () => {
    await triggerInitialSync('user-1', 'item-xyz');

    expect(mockUpdateLiabilities).toHaveBeenCalledWith('item-xyz');
  });

  it('calls sync functions sequentially: transactions → investments → liabilities', async () => {
    const order: string[] = [];

    mockSyncTransactions.mockImplementation(async () => {
      order.push('transactions');
      return fakeSyncResult;
    });
    mockUpdateInvestments.mockImplementation(async () => {
      order.push('investments');
      return fakeInvestmentResult;
    });
    mockUpdateLiabilities.mockImplementation(async () => {
      order.push('liabilities');
      return fakeLiabilityResult;
    });

    await triggerInitialSync('user-1', 'item-xyz');

    expect(order).toEqual(['transactions', 'investments', 'liabilities']);
  });

  it('returns void', async () => {
    const result = await triggerInitialSync('user-1', 'item-xyz');

    expect(result).toBeUndefined();
  });
});
