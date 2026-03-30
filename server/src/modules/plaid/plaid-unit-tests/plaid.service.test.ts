/**
 * @module plaid.service.test
 * @description Unit tests for plaid.service business logic.
 * The Plaid client, encryption module, items service, and all downstream sync
 * services are fully mocked — no real Plaid API calls, DynamoDB, or crypto.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factories — must exist before vi.mock() factory functions run
// ---------------------------------------------------------------------------

const { mockItemPublicTokenExchange, mockAccountsGet } = vi.hoisted(() => ({
  mockItemPublicTokenExchange: vi.fn(),
  mockAccountsGet: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks — declared before any import that triggers module evaluation
// ---------------------------------------------------------------------------

vi.mock('../../../lib/plaidClient.js', () => ({
  plaidClient: {
    itemPublicTokenExchange: mockItemPublicTokenExchange,
    accountsGet: mockAccountsGet,
  },
}));

vi.mock('../../../lib/encryption.js', () => ({
  encrypt: vi.fn((text: string) => `enc:${text}`),
  decrypt: vi.fn((text: string) => text.replace(/^enc:/, '')),
}));

vi.mock('../../items/items.service.js', () => ({
  linkItem: vi.fn(),
  getItemsForUser: vi.fn(),
  updateCursor: vi.fn(),
}));

vi.mock('../../transactions/transactions.service.js', () => ({
  syncTransactions: vi.fn(),
  syncDebtTransactions: vi.fn(),
}));

vi.mock('../../investments/investments.service.js', () => ({
  updateInvestments: vi.fn(),
}));

vi.mock('../../liabilities/liabilities.service.js', () => ({
  updateLiabilities: vi.fn(),
}));

vi.mock('../../accounts/accounts.service.js', () => ({
  syncAccounts: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (must come after vi.mock() calls)
// ---------------------------------------------------------------------------

import { linkBankAccount, triggerInitialSync, syncAllData, getSyncStatus } from '../plaid.service.js';
import * as itemsService from '../../items/items.service.js';
import * as txService from '../../transactions/transactions.service.js';
import * as investmentsService from '../../investments/investments.service.js';
import * as liabilitiesService from '../../liabilities/liabilities.service.js';
import * as accountsService from '../../accounts/accounts.service.js';

const mockLinkItem = vi.mocked(itemsService.linkItem);
const mockGetItemsForUser = vi.mocked(itemsService.getItemsForUser);
const mockUpdateCursor = vi.mocked(itemsService.updateCursor);
const mockSyncTransactions = vi.mocked(txService.syncTransactions);
const mockSyncDebtTransactions = vi.mocked(txService.syncDebtTransactions);
const mockUpdateInvestments = vi.mocked(investmentsService.updateInvestments);
const mockUpdateLiabilities = vi.mocked(liabilitiesService.updateLiabilities);
const mockSyncAccounts = vi.mocked(accountsService.syncAccounts);

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

const fakeSyncResult = { addedCount: 5, modifiedCount: 0, removedCount: 0, nextCursor: 'cursor-1', hasTransactionCapableAccounts: true, notReady: false };
const fakeEmptySyncResult = { addedCount: 0, modifiedCount: 0, removedCount: 0, nextCursor: '', hasTransactionCapableAccounts: true, notReady: false };
const fakeInvestmentResult = { transactionsUpserted: 0, holdingsUpserted: 0, snapshotDate: '2024-01-01' };
const fakeLiabilityResult = { creditCount: 0, studentCount: 0, mortgageCount: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  // Exclude setImmediate from faking — the fire-and-forget linkBankAccount
  // tests use real setImmediate to drain the microtask queue.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  mockItemPublicTokenExchange.mockResolvedValue(fakeExchangeResponse);
  mockAccountsGet.mockResolvedValue({ data: { accounts: [] } });
  mockLinkItem.mockResolvedValue(fakePlaidItem);
  mockSyncAccounts.mockResolvedValue(undefined);
  mockSyncTransactions.mockResolvedValue(fakeSyncResult);
  mockSyncDebtTransactions.mockResolvedValue(0);
  mockUpdateInvestments.mockResolvedValue(fakeInvestmentResult);
  mockUpdateLiabilities.mockResolvedValue(fakeLiabilityResult);
  mockUpdateCursor.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
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

  it('calls accountsGet with the access token to populate accounts', async () => {
    await linkBankAccount('user-1', 'pub-token', 'ins-1', 'Test Bank');

    expect(mockAccountsGet).toHaveBeenCalledWith({
      access_token: 'access-sandbox-abc',
    });
  });

  it('calls syncAccounts with accounts from the accountsGet response', async () => {
    const fakeAccounts = [{ account_id: 'acct-1', type: 'depository' }];
    mockAccountsGet.mockResolvedValue({ data: { accounts: fakeAccounts } });

    await linkBankAccount('user-1', 'pub-token', 'ins-1', 'Test Bank');

    expect(mockSyncAccounts).toHaveBeenCalledWith('user-1', 'item-xyz', fakeAccounts);
  });

  it('does NOT call syncTransactions — sync is decoupled from linking', async () => {
    await linkBankAccount('user-1', 'pub-token', 'ins-1', 'Test Bank');

    // Drain microtask queue to be thorough
    await vi.advanceTimersByTimeAsync(0);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockSyncTransactions).not.toHaveBeenCalled();
  });

  it('does NOT call updateInvestments — sync is decoupled from linking', async () => {
    await linkBankAccount('user-1', 'pub-token', 'ins-1', 'Test Bank');

    await vi.advanceTimersByTimeAsync(0);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockUpdateInvestments).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// triggerInitialSync
// ---------------------------------------------------------------------------

describe('triggerInitialSync', () => {
  it('calls syncTransactions with userId, itemId, and commitCursor: false', async () => {
    const promise = triggerInitialSync('user-1', 'item-xyz');
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    expect(mockSyncTransactions).toHaveBeenCalledWith('user-1', 'item-xyz', { commitCursor: false });
  });

  it('calls updateCursor with the nextCursor after transactions sync', async () => {
    const promise = triggerInitialSync('user-1', 'item-xyz');
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    expect(mockUpdateCursor).toHaveBeenCalledWith('item-xyz', 'cursor-1');
  });

  it('polls up to MAX_POLL_RETRIES times when addedCount is 0', async () => {
    mockSyncTransactions.mockResolvedValue(fakeEmptySyncResult);

    const promise = triggerInitialSync('user-1', 'item-xyz');
    // Advance through all 4 retry delays (2000ms each) — initial call + 4 retries = 5 total
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(2000);
    }
    await promise;

    // 1 initial + 4 retries = 5 total calls
    expect(mockSyncTransactions).toHaveBeenCalledTimes(5);
  });

  it('stops polling once addedCount > 0', async () => {
    // First call returns 0, second returns data
    mockSyncTransactions
      .mockResolvedValueOnce(fakeEmptySyncResult)
      .mockResolvedValueOnce(fakeSyncResult);

    const promise = triggerInitialSync('user-1', 'item-xyz');
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    // Initial call + 1 retry = 2 total
    expect(mockSyncTransactions).toHaveBeenCalledTimes(2);
  });

  it('commits cursor exactly once after polling ends', async () => {
    mockSyncTransactions
      .mockResolvedValueOnce(fakeEmptySyncResult)
      .mockResolvedValueOnce(fakeSyncResult);

    const promise = triggerInitialSync('user-1', 'item-xyz');
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(mockUpdateCursor).toHaveBeenCalledTimes(1);
    expect(mockUpdateCursor).toHaveBeenCalledWith('item-xyz', 'cursor-1');
  });

  it('sets cursor to empty string on ITEM_ERROR for transactions', async () => {
    const itemError = { response: { data: { error_type: 'ITEM_ERROR', error_code: 'NO_ACCOUNTS' } } };
    mockSyncTransactions.mockRejectedValue(itemError);

    const promise = triggerInitialSync('user-1', 'item-xyz');
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    // Sets cursor to "" so getSyncStatus counts it as synced
    expect(mockUpdateCursor).toHaveBeenCalledWith('item-xyz', '');
  });

  it('calls updateInvestments with userId and itemId', async () => {
    const promise = triggerInitialSync('user-1', 'item-xyz');
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    expect(mockUpdateInvestments).toHaveBeenCalledWith('user-1', 'item-xyz');
  });

  it('calls updateLiabilities with itemId only', async () => {
    const promise = triggerInitialSync('user-1', 'item-xyz');
    await vi.advanceTimersByTimeAsync(0);
    await promise;

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

    const promise = triggerInitialSync('user-1', 'item-xyz');
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    expect(order).toEqual(['transactions', 'investments', 'liabilities']);
  });

  it('skips investments on ITEM_ERROR and continues to liabilities', async () => {
    const itemError = { response: { data: { error_type: 'ITEM_ERROR', error_code: 'NO_INVESTMENT_ACCOUNTS' } } };
    mockUpdateInvestments.mockRejectedValue(itemError);

    const promise = triggerInitialSync('user-1', 'item-xyz');
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    expect(mockUpdateLiabilities).toHaveBeenCalledWith('item-xyz');
  });

  it('skips liabilities on ITEM_ERROR without throwing', async () => {
    const itemError = { response: { data: { error_type: 'ITEM_ERROR', error_code: 'NO_LIABILITY_ACCOUNTS' } } };
    mockUpdateLiabilities.mockRejectedValue(itemError);

    const promise = triggerInitialSync('user-1', 'item-xyz');
    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).resolves.not.toThrow();
  });

  it('propagates non-ITEM_ERROR failures from syncTransactions', async () => {
    mockSyncTransactions.mockRejectedValue(new Error('Network failure'));

    const promise = triggerInitialSync('user-1', 'item-xyz');
    // Attach rejection handler BEFORE advancing timers to prevent unhandled rejection
    const expectation = expect(promise).rejects.toThrow('Network failure');
    await vi.advanceTimersByTimeAsync(0);
    await expectation;
  });

  it('propagates non-ITEM_ERROR failures from updateInvestments', async () => {
    const authError = { response: { data: { error_type: 'AUTH_ERROR', error_code: 'AUTH_FAILED' } } };
    mockUpdateInvestments.mockRejectedValue(authError);

    const promise = triggerInitialSync('user-1', 'item-xyz');
    // Attach rejection handler BEFORE advancing timers to prevent unhandled rejection
    const expectation = expect(promise).rejects.toEqual(authError);
    await vi.advanceTimersByTimeAsync(0);
    await expectation;
  });

  it('returns void', async () => {
    const promise = triggerInitialSync('user-1', 'item-xyz');
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getSyncStatus
// ---------------------------------------------------------------------------

describe('getSyncStatus', () => {
  it('returns ready: true when all active items have a transactionCursor', async () => {
    mockGetItemsForUser.mockResolvedValue([
      { ...fakePlaidItem, transactionCursor: 'cursor-abc' },
    ] as never);

    const result = await getSyncStatus('user-1');

    expect(result).toEqual({ itemsLinked: 1, itemsSynced: 1, ready: true });
  });

  it('returns ready: false when an active item has null transactionCursor', async () => {
    mockGetItemsForUser.mockResolvedValue([
      { ...fakePlaidItem, transactionCursor: null },
    ] as never);

    const result = await getSyncStatus('user-1');

    expect(result).toEqual({ itemsLinked: 1, itemsSynced: 0, ready: false });
  });

  it('counts items with empty string cursor as synced (ITEM_ERROR skip sets cursor to "")', async () => {
    mockGetItemsForUser.mockResolvedValue([
      { ...fakePlaidItem, transactionCursor: '' },
    ] as never);

    const result = await getSyncStatus('user-1');

    expect(result).toEqual({ itemsLinked: 1, itemsSynced: 1, ready: true });
  });

  it('returns ready: false when no items are linked', async () => {
    mockGetItemsForUser.mockResolvedValue([]);

    const result = await getSyncStatus('user-1');

    expect(result).toEqual({ itemsLinked: 0, itemsSynced: 0, ready: false });
  });

  it('excludes non-active items from the count', async () => {
    mockGetItemsForUser.mockResolvedValue([
      { ...fakePlaidItem, status: 'bad', transactionCursor: null },
    ] as never);

    const result = await getSyncStatus('user-1');

    expect(result).toEqual({ itemsLinked: 0, itemsSynced: 0, ready: false });
  });

  it('handles multiple items with mixed sync states', async () => {
    mockGetItemsForUser.mockResolvedValue([
      { ...fakePlaidItem, itemId: 'item-1', transactionCursor: 'cursor-1' },
      { ...fakePlaidItem, itemId: 'item-2', transactionCursor: null },
    ] as never);

    const result = await getSyncStatus('user-1');

    expect(result).toEqual({ itemsLinked: 2, itemsSynced: 1, ready: false });
  });
});

// ---------------------------------------------------------------------------
// syncAllData
// ---------------------------------------------------------------------------

describe('syncAllData', () => {
  it('syncs all data types for each active item', async () => {
    mockGetItemsForUser.mockResolvedValue([
      { ...fakePlaidItem, itemId: 'item-1', accessToken: 'tok-1' },
    ] as never);

    const promise = syncAllData('user-1');
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    expect(mockSyncTransactions).toHaveBeenCalledWith('user-1', 'item-1');
    expect(mockSyncDebtTransactions).toHaveBeenCalledWith('user-1', 'item-1');
    expect(mockUpdateInvestments).toHaveBeenCalledWith('user-1', 'item-1');
    expect(mockUpdateLiabilities).toHaveBeenCalledWith('item-1');
  });

  it('processes multiple items in parallel', async () => {
    mockGetItemsForUser.mockResolvedValue([
      { ...fakePlaidItem, itemId: 'item-1', accessToken: 'tok-1' },
      { ...fakePlaidItem, itemId: 'item-2', accessToken: 'tok-2' },
    ] as never);

    const promise = syncAllData('user-1');
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    // Both items should have been synced
    expect(mockSyncTransactions).toHaveBeenCalledTimes(2);
    expect(mockSyncDebtTransactions).toHaveBeenCalledTimes(2);
    expect(mockUpdateInvestments).toHaveBeenCalledTimes(2);
    expect(mockUpdateLiabilities).toHaveBeenCalledTimes(2);
  });

  it('skips inactive items', async () => {
    mockGetItemsForUser.mockResolvedValue([
      { ...fakePlaidItem, itemId: 'item-1', status: 'bad' as const },
    ] as never);

    const promise = syncAllData('user-1');
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    expect(mockSyncTransactions).not.toHaveBeenCalled();
  });

  it('continues syncing other items when one fails with a non-ITEM_ERROR', async () => {
    mockGetItemsForUser.mockResolvedValue([
      { ...fakePlaidItem, itemId: 'item-1', accessToken: 'tok-1' },
      { ...fakePlaidItem, itemId: 'item-2', accessToken: 'tok-2' },
    ] as never);

    // First item's transactionsSync fails
    mockSyncTransactions
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(fakeSyncResult);

    const promise = syncAllData('user-1');
    await vi.advanceTimersByTimeAsync(0);

    // Should not throw — errors are caught per item
    await expect(promise).resolves.not.toThrow();
  });

  it('returns aggregate counts', async () => {
    mockGetItemsForUser.mockResolvedValue([
      { ...fakePlaidItem, itemId: 'item-1', accessToken: 'tok-1' },
    ] as never);
    mockSyncTransactions.mockResolvedValue({ ...fakeSyncResult, addedCount: 10, modifiedCount: 2, removedCount: 1 });
    mockSyncDebtTransactions.mockResolvedValue(5);

    const promise = syncAllData('user-1');
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result.transactions.added).toBe(10);
    expect(result.transactions.modified).toBe(2);
    expect(result.transactions.removed).toBe(1);
    expect(result.debtTransactions).toBe(5);
  });
});
