/**
 * @module accounts.service.test
 * @description Unit tests for the Accounts service (business logic layer).
 * The repository is fully mocked — no DynamoDB calls are made.
 * Pure functions (normalizeAccountType, mapPlaidAccount) are tested directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../accounts.repository.js', () => ({
  upsertAccount: vi.fn(),
  getAccountsByUserId: vi.fn(),
  getAccountsByItemId: vi.fn(),
  getAccountByPlaidAccountId: vi.fn(),
}));

import {
  normalizeAccountType,
  mapPlaidAccount,
  syncAccounts,
  getAccountsForUser,
  getAccountsForItem,
  getAccountByPlaidAccountId as getAccountByPlaidAccountIdService,
} from '../accounts.service.js';
import * as repo from '../accounts.repository.js';
import { NotFoundError } from '../../../lib/errors.js';
import type { Account, PlaidAccountData } from '../accounts.types.js';

const mockUpsertAccount = vi.mocked(repo.upsertAccount);
const mockGetAccountsByUserId = vi.mocked(repo.getAccountsByUserId);
const mockGetAccountsByItemId = vi.mocked(repo.getAccountsByItemId);
const mockGetAccountByPlaidAccountId = vi.mocked(repo.getAccountByPlaidAccountId);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const samplePlaidAccount: PlaidAccountData = {
  account_id: 'plaid-acct-abc',
  name: 'Chase Checking',
  official_name: 'Chase Total Checking®',
  mask: '1234',
  type: 'depository',
  subtype: 'checking',
  balances: {
    current: 1500.0,
    available: 1450.0,
    limit: null,
    iso_currency_code: 'USD',
    unofficial_currency_code: null,
  },
};

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
// normalizeAccountType
// ---------------------------------------------------------------------------

describe('normalizeAccountType', () => {
  it('returns "depository" for "depository"', () => {
    expect(normalizeAccountType('depository')).toBe('depository');
  });

  it('returns "credit" for "credit"', () => {
    expect(normalizeAccountType('credit')).toBe('credit');
  });

  it('returns "loan" for "loan"', () => {
    expect(normalizeAccountType('loan')).toBe('loan');
  });

  it('returns "investment" for "investment"', () => {
    expect(normalizeAccountType('investment')).toBe('investment');
  });

  it('returns "payroll" for "payroll"', () => {
    expect(normalizeAccountType('payroll')).toBe('payroll');
  });

  it('returns "other" for "other"', () => {
    expect(normalizeAccountType('other')).toBe('other');
  });

  it('returns "other" for an unrecognized type string', () => {
    expect(normalizeAccountType('unknown_future_type')).toBe('other');
  });

  it('returns "other" for an empty string', () => {
    expect(normalizeAccountType('')).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// mapPlaidAccount
// ---------------------------------------------------------------------------

describe('mapPlaidAccount', () => {
  it('maps plaidAccount.account_id to plaidAccountId', () => {
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    expect(result.plaidAccountId).toBe('plaid-acct-abc');
  });

  it('maps plaidAccount.name to name', () => {
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    expect(result.name).toBe('Chase Checking');
  });

  it('maps plaidAccount.official_name to officialName', () => {
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    expect(result.officialName).toBe('Chase Total Checking®');
  });

  it('maps null official_name to null officialName', () => {
    const acct: PlaidAccountData = { ...samplePlaidAccount, official_name: null };
    const result = mapPlaidAccount('user-123', 'item-xyz', acct);
    expect(result.officialName).toBeNull();
  });

  it('maps plaidAccount.mask to mask', () => {
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    expect(result.mask).toBe('1234');
  });

  it('normalizes the type string via normalizeAccountType', () => {
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    expect(result.type).toBe('depository');
  });

  it('maps an unknown type to "other"', () => {
    const acct: PlaidAccountData = { ...samplePlaidAccount, type: 'mystery_type' };
    const result = mapPlaidAccount('user-123', 'item-xyz', acct);
    expect(result.type).toBe('other');
  });

  it('maps plaidAccount.subtype to subtype', () => {
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    expect(result.subtype).toBe('checking');
  });

  it('maps balances.current to currentBalance', () => {
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    expect(result.currentBalance).toBe(1500.0);
  });

  it('maps balances.available to availableBalance', () => {
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    expect(result.availableBalance).toBe(1450.0);
  });

  it('maps balances.limit to limitBalance', () => {
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    expect(result.limitBalance).toBeNull();
  });

  it('maps balances.iso_currency_code to isoCurrencyCode', () => {
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    expect(result.isoCurrencyCode).toBe('USD');
  });

  it('maps balances.unofficial_currency_code to unofficialCurrencyCode', () => {
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    expect(result.unofficialCurrencyCode).toBeNull();
  });

  it('sets userId from the first parameter', () => {
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    expect(result.userId).toBe('user-123');
  });

  it('sets itemId from the second parameter', () => {
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    expect(result.itemId).toBe('item-xyz');
  });

  it('sets updatedAt to a current ISO timestamp', () => {
    const before = new Date().toISOString();
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    const after = new Date().toISOString();
    expect(result.updatedAt >= before).toBe(true);
    expect(result.updatedAt <= after).toBe(true);
  });

  it('sets createdAt to a current ISO timestamp', () => {
    const before = new Date().toISOString();
    const result = mapPlaidAccount('user-123', 'item-xyz', samplePlaidAccount);
    const after = new Date().toISOString();
    expect(result.createdAt >= before).toBe(true);
    expect(result.createdAt <= after).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// syncAccounts
// ---------------------------------------------------------------------------

describe('syncAccounts', () => {
  it('calls upsertAccount once for each PlaidAccountData provided', async () => {
    mockUpsertAccount.mockResolvedValue(undefined);
    const second: PlaidAccountData = { ...samplePlaidAccount, account_id: 'plaid-acct-def' };
    await syncAccounts('user-123', 'item-xyz', [samplePlaidAccount, second]);
    expect(mockUpsertAccount).toHaveBeenCalledTimes(2);
  });

  it('passes a mapped Account (with userId and itemId) into upsertAccount', async () => {
    mockUpsertAccount.mockResolvedValue(undefined);
    await syncAccounts('user-123', 'item-xyz', [samplePlaidAccount]);
    const passedAccount = mockUpsertAccount.mock.calls[0][0];
    expect(passedAccount.plaidAccountId).toBe('plaid-acct-abc');
    expect(passedAccount.userId).toBe('user-123');
    expect(passedAccount.itemId).toBe('item-xyz');
  });

  it('returns void on success', async () => {
    mockUpsertAccount.mockResolvedValue(undefined);
    const result = await syncAccounts('user-123', 'item-xyz', [samplePlaidAccount]);
    expect(result).toBeUndefined();
  });

  it('does not call upsertAccount when given an empty accounts array', async () => {
    await syncAccounts('user-123', 'item-xyz', []);
    expect(mockUpsertAccount).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getAccountsForUser
// ---------------------------------------------------------------------------

describe('getAccountsForUser', () => {
  it('calls getAccountsByUserId with the userId', async () => {
    mockGetAccountsByUserId.mockResolvedValue([]);
    await getAccountsForUser('user-123');
    expect(mockGetAccountsByUserId).toHaveBeenCalledWith('user-123');
  });

  it('returns an empty array when no accounts exist', async () => {
    mockGetAccountsByUserId.mockResolvedValue([]);
    const result = await getAccountsForUser('user-123');
    expect(result).toEqual([]);
  });

  it('returns the accounts from the repository', async () => {
    mockGetAccountsByUserId.mockResolvedValue([sampleAccount]);
    const result = await getAccountsForUser('user-123');
    expect(result).toEqual([sampleAccount]);
  });
});

// ---------------------------------------------------------------------------
// getAccountsForItem
// ---------------------------------------------------------------------------

describe('getAccountsForItem', () => {
  it('calls getAccountsByItemId with the itemId', async () => {
    mockGetAccountsByItemId.mockResolvedValue([]);
    await getAccountsForItem('item-xyz');
    expect(mockGetAccountsByItemId).toHaveBeenCalledWith('item-xyz');
  });

  it('returns an empty array when no accounts exist for the item', async () => {
    mockGetAccountsByItemId.mockResolvedValue([]);
    const result = await getAccountsForItem('item-xyz');
    expect(result).toEqual([]);
  });

  it('returns the accounts from the repository', async () => {
    mockGetAccountsByItemId.mockResolvedValue([sampleAccount]);
    const result = await getAccountsForItem('item-xyz');
    expect(result).toEqual([sampleAccount]);
  });
});

// ---------------------------------------------------------------------------
// getAccountByPlaidAccountId (service — throws on null)
// ---------------------------------------------------------------------------

describe('getAccountByPlaidAccountId', () => {
  it('calls the repository with the plaidAccountId', async () => {
    mockGetAccountByPlaidAccountId.mockResolvedValue(sampleAccount);
    await getAccountByPlaidAccountIdService('plaid-acct-abc');
    expect(mockGetAccountByPlaidAccountId).toHaveBeenCalledWith('plaid-acct-abc');
  });

  it('returns the account when found', async () => {
    mockGetAccountByPlaidAccountId.mockResolvedValue(sampleAccount);
    const result = await getAccountByPlaidAccountIdService('plaid-acct-abc');
    expect(result).toEqual(sampleAccount);
  });

  it('throws NotFoundError when the repository returns null', async () => {
    mockGetAccountByPlaidAccountId.mockResolvedValue(null);
    await expect(getAccountByPlaidAccountIdService('plaid-acct-abc')).rejects.toThrow(NotFoundError);
  });

  it('includes the plaidAccountId in the NotFoundError message', async () => {
    mockGetAccountByPlaidAccountId.mockResolvedValue(null);
    await expect(getAccountByPlaidAccountIdService('plaid-acct-abc')).rejects.toThrow(
      'plaid-acct-abc',
    );
  });
});
