/**
 * @module transactions.service.test
 * @description Unit tests for the Transactions service (business logic layer).
 * The repository, Plaid client, items service, and accounts service are all
 * fully mocked — no DynamoDB calls or real HTTP requests are made.
 *
 * Key behaviors under test:
 *   - mapPlaidTransaction: pure mapping from Plaid API shape → our Transaction shape
 *   - syncTransactions: cursor-based Plaid sync loop with upsert/delete/cursor commit
 *   - getTransactionsSince / getTransactionsInRange: pending-transaction filtering
 *
 * Sync loop invariants:
 *   - accounts.service.syncAccounts is called before transactions are processed on each page
 *   - added and modified are both upserted (same operation)
 *   - removed are deleted — failure aborts the loop
 *   - upsert failures are logged-and-skipped (the loop advances past them)
 *   - updateCursor is called exactly once, after the full loop completes — never mid-loop
 *   - TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION restarts from the pre-sync cursor
 *   - commitCursor: false skips the cursor persist (caller owns the commit)
 *   - notReady flag prevents cursor commit when Plaid data isn't processed yet
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../transactions.repository.js', () => ({
  upsertTransaction: vi.fn(),
  deleteByPlaidTransactionId: vi.fn(),
  getTransactionsSince: vi.fn(),
  getTransactionsInRange: vi.fn(),
}));

vi.mock('../../items/items.service.js', () => ({
  getItemForSync: vi.fn(),
  updateCursor: vi.fn(),
}));

vi.mock('../../accounts/accounts.service.js', () => ({
  syncAccounts: vi.fn(),
}));

// vi.hoisted() makes mockTransactionsSync available inside the vi.mock factory.
const { mockTransactionsSync } = vi.hoisted(() => ({
  mockTransactionsSync: vi.fn(),
}));
vi.mock('../../../lib/plaidClient.js', () => ({
  plaidClient: { transactionsSync: mockTransactionsSync },
}));

import {
  mapPlaidTransaction,
  syncTransactions,
  getTransactionsSince,
  getTransactionsInRange,
} from '../transactions.service.js';
import * as repo from '../transactions.repository.js';
import * as itemsService from '../../items/items.service.js';
import * as accountsService from '../../accounts/accounts.service.js';
import type { Transaction, PlaidTransaction } from '../transactions.types.js';

const mockUpsertTransaction = vi.mocked(repo.upsertTransaction);
const mockDeleteByPlaidTransactionId = vi.mocked(repo.deleteByPlaidTransactionId);
const mockGetTransactionsSince = vi.mocked(repo.getTransactionsSince);
const mockGetTransactionsInRange = vi.mocked(repo.getTransactionsInRange);
const mockGetItemForSync = vi.mocked(itemsService.getItemForSync);
const mockUpdateCursor = vi.mocked(itemsService.updateCursor);
const mockSyncAccounts = vi.mocked(accountsService.syncAccounts);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const samplePlaidTx: PlaidTransaction = {
  transaction_id: 'txn-abc',
  account_id: 'acct-xyz',
  amount: 42.5,
  date: '2025-01-15',
  name: 'Starbucks',
  merchant_name: 'Starbucks',
  personal_finance_category: {
    primary: 'FOOD_AND_DRINK',
    detailed: 'FOOD_AND_DRINK_COFFEE',
    icon_url: 'https://plaid.com/categories/food.png',
  },
  pending: false,
  iso_currency_code: 'USD',
  unofficial_currency_code: null,
};

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

/** A minimal PlaidItem with decrypted access token, as returned by getItemForSync. */
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

/** A single-page Plaid response with no more pages. */
function makeSinglePageResponse(overrides: {
  added?: PlaidTransaction[];
  modified?: PlaidTransaction[];
  removed?: { transaction_id: string }[];
  next_cursor?: string;
  accounts?: { account_id: string; type?: string }[];
  transactions_update_status?: string;
}) {
  return {
    data: {
      added: overrides.added ?? [],
      modified: overrides.modified ?? [],
      removed: overrides.removed ?? [],
      has_more: false,
      next_cursor: overrides.next_cursor ?? 'cursor-final',
      accounts: overrides.accounts ?? [],
      transactions_update_status: overrides.transactions_update_status,
    },
  };
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// mapPlaidTransaction
// ---------------------------------------------------------------------------

describe('mapPlaidTransaction', () => {
  it('sets userId from the first parameter', () => {
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    expect(result.userId).toBe('user-123');
  });

  it('builds sortKey as "date#transaction_id"', () => {
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    expect(result.sortKey).toBe('2025-01-15#txn-abc');
  });

  it('maps transaction_id to plaidTransactionId', () => {
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    expect(result.plaidTransactionId).toBe('txn-abc');
  });

  it('maps account_id to plaidAccountId', () => {
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    expect(result.plaidAccountId).toBe('acct-xyz');
  });

  it('copies the amount field directly', () => {
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    expect(result.amount).toBe(42.5);
  });

  it('copies the date field directly (YYYY-MM-DD)', () => {
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    expect(result.date).toBe('2025-01-15');
  });

  it('copies the name field directly', () => {
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    expect(result.name).toBe('Starbucks');
  });

  it('maps merchant_name to merchantName', () => {
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    expect(result.merchantName).toBe('Starbucks');
  });

  it('maps null merchant_name to null merchantName', () => {
    const tx: PlaidTransaction = { ...samplePlaidTx, merchant_name: null };
    const result = mapPlaidTransaction('user-123', tx);
    expect(result.merchantName).toBeNull();
  });

  it('maps personal_finance_category.primary to category', () => {
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    expect(result.category).toBe('FOOD_AND_DRINK');
  });

  it('maps personal_finance_category.detailed to detailedCategory', () => {
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    expect(result.detailedCategory).toBe('FOOD_AND_DRINK_COFFEE');
  });

  it('maps personal_finance_category.icon_url to categoryIconUrl', () => {
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    expect(result.categoryIconUrl).toBe('https://plaid.com/categories/food.png');
  });

  it('sets category, detailedCategory, and categoryIconUrl to null when personal_finance_category is null', () => {
    const tx: PlaidTransaction = { ...samplePlaidTx, personal_finance_category: null };
    const result = mapPlaidTransaction('user-123', tx);
    expect(result.category).toBeNull();
    expect(result.detailedCategory).toBeNull();
    expect(result.categoryIconUrl).toBeNull();
  });

  it('copies the pending boolean directly', () => {
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    expect(result.pending).toBe(false);
  });

  it('maps a pending transaction correctly', () => {
    const tx: PlaidTransaction = { ...samplePlaidTx, pending: true };
    const result = mapPlaidTransaction('user-123', tx);
    expect(result.pending).toBe(true);
  });

  it('maps iso_currency_code to isoCurrencyCode', () => {
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    expect(result.isoCurrencyCode).toBe('USD');
  });

  it('maps null iso_currency_code to null isoCurrencyCode', () => {
    const tx: PlaidTransaction = { ...samplePlaidTx, iso_currency_code: null };
    const result = mapPlaidTransaction('user-123', tx);
    expect(result.isoCurrencyCode).toBeNull();
  });

  it('maps unofficial_currency_code to unofficialCurrencyCode', () => {
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    expect(result.unofficialCurrencyCode).toBeNull();
  });

  it('sets createdAt to a current ISO timestamp when existingCreatedAt is not provided', () => {
    const before = new Date().toISOString();
    const result = mapPlaidTransaction('user-123', samplePlaidTx);
    const after = new Date().toISOString();
    expect(result.createdAt >= before).toBe(true);
    expect(result.createdAt <= after).toBe(true);
  });

  it('uses existingCreatedAt when provided, preserving the original creation time', () => {
    const originalTime = '2024-06-01T08:00:00.000Z';
    const result = mapPlaidTransaction('user-123', samplePlaidTx, originalTime);
    expect(result.createdAt).toBe(originalTime);
  });

  it('always sets updatedAt to a current ISO timestamp regardless of existingCreatedAt', () => {
    const originalTime = '2024-06-01T08:00:00.000Z';
    const before = new Date().toISOString();
    const result = mapPlaidTransaction('user-123', samplePlaidTx, originalTime);
    const after = new Date().toISOString();
    expect(result.updatedAt >= before).toBe(true);
    expect(result.updatedAt <= after).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// syncTransactions
// ---------------------------------------------------------------------------

describe('syncTransactions', () => {
  it('calls getItemForSync with the provided itemId', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(makeSinglePageResponse({}));
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    expect(mockGetItemForSync).toHaveBeenCalledWith('item-abc');
  });

  it('calls transactionsSync with include_personal_finance_category: true', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(makeSinglePageResponse({}));
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    const arg = mockTransactionsSync.mock.calls[0][0];
    expect(arg.options?.include_personal_finance_category).toBe(true);
  });

  it('calls transactionsSync with count: 500', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(makeSinglePageResponse({}));
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    const arg = mockTransactionsSync.mock.calls[0][0];
    expect(arg.count).toBe(500);
  });

  it('calls transactionsSync with the item accessToken', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(makeSinglePageResponse({}));
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    const arg = mockTransactionsSync.mock.calls[0][0];
    expect(arg.access_token).toBe('access-sandbox-token');
  });

  it('does not include cursor when transactionCursor is null (initial full-history sync)', async () => {
    mockGetItemForSync.mockResolvedValue({ ...sampleItem, transactionCursor: null });
    mockTransactionsSync.mockResolvedValue(makeSinglePageResponse({}));
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    const arg = mockTransactionsSync.mock.calls[0][0];
    expect(arg.cursor).toBeUndefined();
  });

  it('passes the saved cursor when transactionCursor is a non-null string (delta sync)', async () => {
    mockGetItemForSync.mockResolvedValue({ ...sampleItem, transactionCursor: 'saved-cursor' });
    mockTransactionsSync.mockResolvedValue(makeSinglePageResponse({}));
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    const arg = mockTransactionsSync.mock.calls[0][0];
    expect(arg.cursor).toBe('saved-cursor');
  });

  it('calls syncAccounts on each page before processing transactions', async () => {
    const pageAccounts = [{ account_id: 'acct-1' }];
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue({
      data: {
        added: [samplePlaidTx],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: 'cursor-final',
        accounts: pageAccounts,
      },
    });
    mockSyncAccounts.mockResolvedValue(undefined);
    mockUpsertTransaction.mockResolvedValue(undefined);
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    expect(mockSyncAccounts).toHaveBeenCalledWith('user-123', 'item-abc', pageAccounts);
  });

  it('upserts all added transactions', async () => {
    const tx2: PlaidTransaction = { ...samplePlaidTx, transaction_id: 'txn-2' };
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(makeSinglePageResponse({ added: [samplePlaidTx, tx2] }));
    mockSyncAccounts.mockResolvedValue(undefined);
    mockUpsertTransaction.mockResolvedValue(undefined);
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    expect(mockUpsertTransaction).toHaveBeenCalledTimes(2);
  });

  it('upserts all modified transactions (same operation as added)', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(
      makeSinglePageResponse({ modified: [samplePlaidTx] }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    mockUpsertTransaction.mockResolvedValue(undefined);
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    expect(mockUpsertTransaction).toHaveBeenCalledTimes(1);
  });

  it('upserts both added and modified transactions in the same pass', async () => {
    const modified: PlaidTransaction = { ...samplePlaidTx, transaction_id: 'txn-mod' };
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(
      makeSinglePageResponse({ added: [samplePlaidTx], modified: [modified] }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    mockUpsertTransaction.mockResolvedValue(undefined);
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    expect(mockUpsertTransaction).toHaveBeenCalledTimes(2);
  });

  it('calls deleteByPlaidTransactionId for each removed transaction', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(
      makeSinglePageResponse({ removed: [{ transaction_id: 'txn-removed' }] }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    mockDeleteByPlaidTransactionId.mockResolvedValue(undefined);
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    expect(mockDeleteByPlaidTransactionId).toHaveBeenCalledWith('txn-removed');
  });

  it('loops until has_more is false, calling transactionsSync for each page', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    // Page 1 — has_more: true
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [],
        modified: [],
        removed: [],
        has_more: true,
        next_cursor: 'cursor-page-1',
        accounts: [],
      },
    });
    // Page 2 — has_more: false (end of loop)
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: 'cursor-final',
        accounts: [],
      },
    });
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    expect(mockTransactionsSync).toHaveBeenCalledTimes(2);
  });

  it('passes the page cursor to the next transactionsSync call during multi-page sync', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [],
        modified: [],
        removed: [],
        has_more: true,
        next_cursor: 'cursor-page-1',
        accounts: [],
      },
    });
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: 'cursor-final',
        accounts: [],
      },
    });
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    const secondCallArg = mockTransactionsSync.mock.calls[1][0];
    expect(secondCallArg.cursor).toBe('cursor-page-1');
  });

  it('calls updateCursor exactly once, after the full loop completes', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [],
        modified: [],
        removed: [],
        has_more: true,
        next_cursor: 'cursor-page-1',
        accounts: [],
      },
    });
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: 'cursor-final',
        accounts: [],
      },
    });
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    // Not called once per page — only once at the end
    expect(mockUpdateCursor).toHaveBeenCalledTimes(1);
  });

  it('calls updateCursor with the final next_cursor from the last page', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [],
        modified: [],
        removed: [],
        has_more: true,
        next_cursor: 'cursor-page-1',
        accounts: [],
      },
    });
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: 'cursor-final',
        accounts: [],
      },
    });
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    expect(mockUpdateCursor).toHaveBeenCalledWith('item-abc', 'cursor-final');
  });

  it('returns a SyncResult with addedCount reflecting all added transactions across pages', async () => {
    const tx2: PlaidTransaction = { ...samplePlaidTx, transaction_id: 'txn-2' };
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [samplePlaidTx],
        modified: [],
        removed: [],
        has_more: true,
        next_cursor: 'cursor-page-1',
        accounts: [],
      },
    });
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [tx2],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: 'cursor-final',
        accounts: [],
      },
    });
    mockSyncAccounts.mockResolvedValue(undefined);
    mockUpsertTransaction.mockResolvedValue(undefined);
    mockUpdateCursor.mockResolvedValue(undefined);

    const result = await syncTransactions('user-123', 'item-abc');

    expect(result.addedCount).toBe(2);
  });

  it('returns a SyncResult with modifiedCount reflecting all modified transactions across pages', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(
      makeSinglePageResponse({ modified: [samplePlaidTx] }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    mockUpsertTransaction.mockResolvedValue(undefined);
    mockUpdateCursor.mockResolvedValue(undefined);

    const result = await syncTransactions('user-123', 'item-abc');

    expect(result.modifiedCount).toBe(1);
  });

  it('returns a SyncResult with removedCount reflecting all removed transactions across pages', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(
      makeSinglePageResponse({ removed: [{ transaction_id: 'txn-removed' }] }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    mockDeleteByPlaidTransactionId.mockResolvedValue(undefined);
    mockUpdateCursor.mockResolvedValue(undefined);

    const result = await syncTransactions('user-123', 'item-abc');

    expect(result.removedCount).toBe(1);
  });

  it('returns a SyncResult with the final nextCursor', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(makeSinglePageResponse({ next_cursor: 'cursor-final' }));
    mockUpdateCursor.mockResolvedValue(undefined);

    const result = await syncTransactions('user-123', 'item-abc');

    expect(result.nextCursor).toBe('cursor-final');
  });

  it('returns hasTransactionCapableAccounts: true when depository accounts are present', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(
      makeSinglePageResponse({ accounts: [{ account_id: 'acct-1', type: 'depository' }] }),
    );
    mockUpdateCursor.mockResolvedValue(undefined);

    const result = await syncTransactions('user-123', 'item-abc');

    expect(result.hasTransactionCapableAccounts).toBe(true);
  });

  it('returns hasTransactionCapableAccounts: false when only investment accounts are present', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(
      makeSinglePageResponse({ accounts: [{ account_id: 'acct-1', type: 'investment' }] }),
    );
    mockUpdateCursor.mockResolvedValue(undefined);

    const result = await syncTransactions('user-123', 'item-abc');

    expect(result.hasTransactionCapableAccounts).toBe(false);
  });

  it('returns notReady: true when transactions_update_status is NOT_READY', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(
      makeSinglePageResponse({ transactions_update_status: 'NOT_READY' }),
    );

    const result = await syncTransactions('user-123', 'item-abc');

    expect(result.notReady).toBe(true);
  });

  it('does not commit cursor when notReady is true', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(
      makeSinglePageResponse({ transactions_update_status: 'NOT_READY' }),
    );

    await syncTransactions('user-123', 'item-abc');

    expect(mockUpdateCursor).not.toHaveBeenCalled();
  });

  it('does not commit cursor when commitCursor is false', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(makeSinglePageResponse({}));

    await syncTransactions('user-123', 'item-abc', { commitCursor: false });

    expect(mockUpdateCursor).not.toHaveBeenCalled();
  });

  it('commits cursor when commitCursor is explicitly true', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(makeSinglePageResponse({}));
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc', { commitCursor: true });

    expect(mockUpdateCursor).toHaveBeenCalledTimes(1);
  });

  it('commits cursor by default when no options are provided', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(makeSinglePageResponse({}));
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    expect(mockUpdateCursor).toHaveBeenCalledTimes(1);
  });

  it('restarts from pre-sync cursor on TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION', async () => {
    mockGetItemForSync.mockResolvedValue({ ...sampleItem, transactionCursor: 'pre-sync-cursor' });
    // First call: returns a page
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [samplePlaidTx],
        modified: [],
        removed: [],
        has_more: true,
        next_cursor: 'cursor-page-1',
        accounts: [],
      },
    });
    // Second call: mutation error
    mockTransactionsSync.mockRejectedValueOnce({
      response: { data: { error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' } },
    });
    // Third call (restart): succeeds
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [samplePlaidTx],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: 'cursor-final',
        accounts: [],
      },
    });
    mockSyncAccounts.mockResolvedValue(undefined);
    mockUpsertTransaction.mockResolvedValue(undefined);
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    // After restart, the cursor should be the pre-sync one
    const thirdCallArg = mockTransactionsSync.mock.calls[2][0];
    expect(thirdCallArg.cursor).toBe('pre-sync-cursor');
  });

  it('skips a failed upsert and continues the sync (log-and-skip)', async () => {
    const tx2: PlaidTransaction = { ...samplePlaidTx, transaction_id: 'txn-2' };
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(
      makeSinglePageResponse({ added: [samplePlaidTx, tx2] }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    // First upsert fails; second should still be called
    mockUpsertTransaction
      .mockRejectedValueOnce(new Error('DynamoDB throttle'))
      .mockResolvedValueOnce(undefined);
    mockUpdateCursor.mockResolvedValue(undefined);

    // Should not throw — the failed upsert is skipped
    await expect(syncTransactions('user-123', 'item-abc')).resolves.not.toThrow();
  });

  it('still commits the cursor after a skipped upsert failure', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(
      makeSinglePageResponse({ added: [samplePlaidTx] }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    mockUpsertTransaction.mockRejectedValue(new Error('DynamoDB throttle'));
    mockUpdateCursor.mockResolvedValue(undefined);

    await syncTransactions('user-123', 'item-abc');

    expect(mockUpdateCursor).toHaveBeenCalledTimes(1);
  });

  it('aborts the loop and rejects when a delete fails', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(
      makeSinglePageResponse({ removed: [{ transaction_id: 'txn-removed' }] }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    mockDeleteByPlaidTransactionId.mockRejectedValue(new Error('Delete failed'));

    await expect(syncTransactions('user-123', 'item-abc')).rejects.toThrow('Delete failed');
  });

  it('does not call updateCursor when a delete failure aborts the loop', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockTransactionsSync.mockResolvedValue(
      makeSinglePageResponse({ removed: [{ transaction_id: 'txn-removed' }] }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    mockDeleteByPlaidTransactionId.mockRejectedValue(new Error('Delete failed'));

    await syncTransactions('user-123', 'item-abc').catch(() => {});

    expect(mockUpdateCursor).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getTransactionsSince
// ---------------------------------------------------------------------------

describe('getTransactionsSince', () => {
  it('calls the repository with userId and sinceDate', async () => {
    mockGetTransactionsSince.mockResolvedValue([]);
    await getTransactionsSince('user-123', '2025-01-01');
    expect(mockGetTransactionsSince).toHaveBeenCalledWith('user-123', '2025-01-01');
  });

  it('returns an empty array when the repository returns no transactions', async () => {
    mockGetTransactionsSince.mockResolvedValue([]);
    const result = await getTransactionsSince('user-123', '2025-01-01');
    expect(result).toEqual([]);
  });

  it('filters out pending transactions by default (includePending defaults to false)', async () => {
    const pendingTx: Transaction = { ...sampleTransaction, pending: true };
    const postedTx: Transaction = { ...sampleTransaction, sortKey: '2025-01-15#txn-posted', pending: false };
    mockGetTransactionsSince.mockResolvedValue([pendingTx, postedTx]);

    const result = await getTransactionsSince('user-123', '2025-01-01');

    expect(result).toHaveLength(1);
    expect(result[0].pending).toBe(false);
  });

  it('returns pending transactions when includePending is true', async () => {
    const pendingTx: Transaction = { ...sampleTransaction, pending: true };
    mockGetTransactionsSince.mockResolvedValue([pendingTx]);

    const result = await getTransactionsSince('user-123', '2025-01-01', { includePending: true });

    expect(result).toHaveLength(1);
    expect(result[0].pending).toBe(true);
  });

  it('returns non-pending transactions when includePending is explicitly false', async () => {
    const pendingTx: Transaction = { ...sampleTransaction, pending: true };
    const postedTx: Transaction = { ...sampleTransaction, sortKey: '2025-01-15#txn-posted', pending: false };
    mockGetTransactionsSince.mockResolvedValue([pendingTx, postedTx]);

    const result = await getTransactionsSince('user-123', '2025-01-01', { includePending: false });

    expect(result).toHaveLength(1);
    expect(result[0].pending).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getTransactionsInRange
// ---------------------------------------------------------------------------

describe('getTransactionsInRange', () => {
  it('calls the repository with userId, startDate, and endDate', async () => {
    mockGetTransactionsInRange.mockResolvedValue([]);
    await getTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    expect(mockGetTransactionsInRange).toHaveBeenCalledWith('user-123', '2025-01-01', '2025-01-31');
  });

  it('returns an empty array when the repository returns no transactions', async () => {
    mockGetTransactionsInRange.mockResolvedValue([]);
    const result = await getTransactionsInRange('user-123', '2025-01-01', '2025-01-31');
    expect(result).toEqual([]);
  });

  it('filters out pending transactions by default (includePending defaults to false)', async () => {
    const pendingTx: Transaction = { ...sampleTransaction, pending: true };
    const postedTx: Transaction = { ...sampleTransaction, sortKey: '2025-01-15#txn-posted', pending: false };
    mockGetTransactionsInRange.mockResolvedValue([pendingTx, postedTx]);

    const result = await getTransactionsInRange('user-123', '2025-01-01', '2025-01-31');

    expect(result).toHaveLength(1);
    expect(result[0].pending).toBe(false);
  });

  it('returns pending transactions when includePending is true', async () => {
    const pendingTx: Transaction = { ...sampleTransaction, pending: true };
    mockGetTransactionsInRange.mockResolvedValue([pendingTx]);

    const result = await getTransactionsInRange('user-123', '2025-01-01', '2025-01-31', {
      includePending: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0].pending).toBe(true);
  });

  it('returns non-pending transactions when includePending is explicitly false', async () => {
    const pendingTx: Transaction = { ...sampleTransaction, pending: true };
    const postedTx: Transaction = { ...sampleTransaction, sortKey: '2025-01-15#txn-posted', pending: false };
    mockGetTransactionsInRange.mockResolvedValue([pendingTx, postedTx]);

    const result = await getTransactionsInRange('user-123', '2025-01-01', '2025-01-31', {
      includePending: false,
    });

    expect(result).toHaveLength(1);
    expect(result[0].pending).toBe(false);
  });
});
