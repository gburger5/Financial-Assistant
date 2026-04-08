/**
 * @module tools.test
 * @description Unit tests for agents/core/tools.ts — tool callbacks, error handling,
 * isEmpty flags, descriptions, and the financial snapshot tool.
 * All service dependencies are fully mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError } from '../../../lib/errors.js';

// ---------------------------------------------------------------------------
// Module mocks — must come before tool imports so vi.mock is hoisted
// ---------------------------------------------------------------------------

const { mockGetAccounts, mockGetHoldings, mockGetLiabilities, mockGetUserById } = vi.hoisted(() => ({
  mockGetAccounts: vi.fn(),
  mockGetHoldings: vi.fn(),
  mockGetLiabilities: vi.fn(),
  mockGetUserById: vi.fn(),
}));

vi.mock('../../accounts/accounts.service.js', () => ({
  getAccountsForUser: mockGetAccounts,
}));

vi.mock('../../investments/investments.service.js', () => ({
  getLatestHoldings: mockGetHoldings,
}));

vi.mock('../../liabilities/liabilities.service.js', () => ({
  getLiabilitiesForUser: mockGetLiabilities,
}));

vi.mock('../../auth/auth.service.js', () => ({
  getUserById: mockGetUserById,
}));

import {
  getUserAccounts,
  getUserHoldings,
  getUserLiabilities,
  getUserProfile,
  getUserFinancialSnapshot,
} from '../core/tools.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TEST_USER_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

const mockAccount = {
  userId: TEST_USER_ID,
  plaidAccountId: 'acc_1',
  name: 'Checking',
  type: 'depository',
  subtype: 'checking',
  currentBalance: 5000,
  availableBalance: 4500,
  limitBalance: null,
  isoCurrencyCode: 'USD',
};

const mockHolding = {
  userId: TEST_USER_ID,
  plaidAccountId: 'acc_2',
  securityId: 'sec_1',
  tickerSymbol: 'SWTSX',
  securityName: 'Schwab Total Stock Market',
  securityType: 'mutual fund',
  quantity: 100,
  institutionPrice: 50,
  institutionValue: 5000,
  costBasis: 4000,
  closePrice: 50,
};

const mockLiability = {
  userId: TEST_USER_ID,
  plaidAccountId: 'acc_3',
  liabilityType: 'credit',
  currentBalance: 2000,
  details: {
    minimumPaymentAmount: 50,
    aprs: [{ aprPercentage: 24.99, aprType: 'purchase_apr' }],
  },
};

const mockUser = {
  userId: TEST_USER_ID,
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  birthday: '1990-06-15',
  createdAt: '2024-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// getUserAccounts
// ---------------------------------------------------------------------------

describe('getUserAccounts', () => {
  it('returns accounts without JSON copy (reference equality)', async () => {
    const accounts = [mockAccount];
    mockGetAccounts.mockResolvedValue(accounts);

    const result = await getUserAccounts.invoke({ userId: TEST_USER_ID }) as Record<string, unknown>;
    expect(result.accounts).toBe(accounts);
  });

  it('includes isEmpty: true for empty accounts', async () => {
    mockGetAccounts.mockResolvedValue([]);

    const result = await getUserAccounts.invoke({ userId: TEST_USER_ID });
    expect(result).toEqual({ accounts: [], isEmpty: true });
  });

  it('includes isEmpty: false for non-empty accounts', async () => {
    mockGetAccounts.mockResolvedValue([mockAccount]);

    const result = await getUserAccounts.invoke({ userId: TEST_USER_ID }) as Record<string, unknown>;
    expect(result.isEmpty).toBe(false);
  });

  it('returns structured error on service failure', async () => {
    mockGetAccounts.mockRejectedValue(new Error('DynamoDB timeout'));

    const result = await getUserAccounts.invoke({ userId: TEST_USER_ID });
    expect(result).toEqual({
      error: 'FAILED_TO_FETCH_ACCOUNTS',
      message: 'DynamoDB timeout',
      retryable: true,
    });
  });
});

// ---------------------------------------------------------------------------
// getUserHoldings
// ---------------------------------------------------------------------------

describe('getUserHoldings', () => {
  it('returns holdings without JSON copy (reference equality)', async () => {
    const holdings = [mockHolding];
    mockGetHoldings.mockResolvedValue(holdings);

    const result = await getUserHoldings.invoke({ userId: TEST_USER_ID }) as Record<string, unknown>;
    expect(result.holdings).toBe(holdings);
  });

  it('includes isEmpty: true for empty holdings', async () => {
    mockGetHoldings.mockResolvedValue([]);

    const result = await getUserHoldings.invoke({ userId: TEST_USER_ID });
    expect(result).toEqual({ holdings: [], isEmpty: true });
  });

  it('includes isEmpty: false for non-empty holdings', async () => {
    mockGetHoldings.mockResolvedValue([mockHolding]);

    const result = await getUserHoldings.invoke({ userId: TEST_USER_ID }) as Record<string, unknown>;
    expect(result.isEmpty).toBe(false);
  });

  it('returns structured error on service failure', async () => {
    mockGetHoldings.mockRejectedValue(new Error('Connection refused'));

    const result = await getUserHoldings.invoke({ userId: TEST_USER_ID });
    expect(result).toEqual({
      error: 'FAILED_TO_FETCH_HOLDINGS',
      message: 'Connection refused',
      retryable: true,
    });
  });
});

// ---------------------------------------------------------------------------
// getUserLiabilities
// ---------------------------------------------------------------------------

describe('getUserLiabilities', () => {
  it('returns liabilities without JSON copy (reference equality)', async () => {
    const liabilities = [mockLiability];
    mockGetLiabilities.mockResolvedValue(liabilities);

    const result = await getUserLiabilities.invoke({ userId: TEST_USER_ID }) as Record<string, unknown>;
    expect(result.liabilities).toBe(liabilities);
  });

  it('includes isEmpty: true for empty liabilities', async () => {
    mockGetLiabilities.mockResolvedValue([]);

    const result = await getUserLiabilities.invoke({ userId: TEST_USER_ID });
    expect(result).toEqual({ liabilities: [], isEmpty: true });
  });

  it('includes isEmpty: false for non-empty liabilities', async () => {
    mockGetLiabilities.mockResolvedValue([mockLiability]);

    const result = await getUserLiabilities.invoke({ userId: TEST_USER_ID }) as Record<string, unknown>;
    expect(result.isEmpty).toBe(false);
  });

  it('returns structured error on service failure', async () => {
    mockGetLiabilities.mockRejectedValue(new Error('Throttled'));

    const result = await getUserLiabilities.invoke({ userId: TEST_USER_ID });
    expect(result).toEqual({
      error: 'FAILED_TO_FETCH_LIABILITIES',
      message: 'Throttled',
      retryable: true,
    });
  });
});

// ---------------------------------------------------------------------------
// getUserProfile
// ---------------------------------------------------------------------------

describe('getUserProfile', () => {
  it('returns name and computed age', async () => {
    mockGetUserById.mockResolvedValue(mockUser);

    const result = await getUserProfile.invoke({ userId: TEST_USER_ID }) as Record<string, unknown>;
    expect(result.firstName).toBe('Jane');
    expect(result.lastName).toBe('Doe');
    expect(typeof result.age).toBe('number');
    expect(result.age).toBeGreaterThan(0);
  });

  it('returns null age when no birthday', async () => {
    mockGetUserById.mockResolvedValue({ ...mockUser, birthday: null });

    const result = await getUserProfile.invoke({ userId: TEST_USER_ID }) as Record<string, unknown>;
    expect(result.age).toBeNull();
  });

  it('returns USER_NOT_FOUND (not retryable) for NotFoundError', async () => {
    mockGetUserById.mockRejectedValue(new NotFoundError('User not found'));

    const result = await getUserProfile.invoke({ userId: TEST_USER_ID });
    expect(result).toEqual({
      error: 'USER_NOT_FOUND',
      message: 'User not found',
      retryable: false,
    });
  });

  it('returns FAILED_TO_FETCH_PROFILE (retryable) for other errors', async () => {
    mockGetUserById.mockRejectedValue(new Error('Connection refused'));

    const result = await getUserProfile.invoke({ userId: TEST_USER_ID });
    expect(result).toEqual({
      error: 'FAILED_TO_FETCH_PROFILE',
      message: 'Connection refused',
      retryable: true,
    });
  });
});

// ---------------------------------------------------------------------------
// getUserFinancialSnapshot
// ---------------------------------------------------------------------------

describe('getUserFinancialSnapshot', () => {
  it('returns all three datasets in one call', async () => {
    mockGetAccounts.mockResolvedValue([mockAccount]);
    mockGetHoldings.mockResolvedValue([mockHolding]);
    mockGetLiabilities.mockResolvedValue([mockLiability]);

    const result = await getUserFinancialSnapshot.invoke({ userId: TEST_USER_ID }) as Record<string, unknown>;

    expect(result.accounts).toEqual([mockAccount]);
    expect(result.holdings).toEqual([mockHolding]);
    expect(result.liabilities).toEqual([mockLiability]);
    expect(result.accountsEmpty).toBe(false);
    expect(result.holdingsEmpty).toBe(false);
    expect(result.liabilitiesEmpty).toBe(false);
    expect(result.accountsError).toBeNull();
    expect(result.holdingsError).toBeNull();
    expect(result.liabilitiesError).toBeNull();
  });

  it('marks empty collections with isEmpty flags', async () => {
    mockGetAccounts.mockResolvedValue([]);
    mockGetHoldings.mockResolvedValue([]);
    mockGetLiabilities.mockResolvedValue([]);

    const result = await getUserFinancialSnapshot.invoke({ userId: TEST_USER_ID }) as Record<string, unknown>;

    expect(result.accountsEmpty).toBe(true);
    expect(result.holdingsEmpty).toBe(true);
    expect(result.liabilitiesEmpty).toBe(true);
  });

  it('returns partial data when one service fails', async () => {
    mockGetAccounts.mockRejectedValue(new Error('DB timeout'));
    mockGetHoldings.mockResolvedValue([mockHolding]);
    mockGetLiabilities.mockResolvedValue([mockLiability]);

    const result = await getUserFinancialSnapshot.invoke({ userId: TEST_USER_ID }) as Record<string, unknown>;

    expect(result.accounts).toBeNull();
    expect(result.accountsEmpty).toBeNull();
    expect(result.accountsError).toEqual({
      error: 'FAILED_TO_FETCH_ACCOUNTS',
      message: 'DB timeout',
      retryable: true,
    });
    // Other two still succeed
    expect(result.holdings).toEqual([mockHolding]);
    expect(result.liabilities).toEqual([mockLiability]);
  });

  it('returns all errors when all services fail', async () => {
    mockGetAccounts.mockRejectedValue(new Error('fail 1'));
    mockGetHoldings.mockRejectedValue(new Error('fail 2'));
    mockGetLiabilities.mockRejectedValue(new Error('fail 3'));

    const result = await getUserFinancialSnapshot.invoke({ userId: TEST_USER_ID }) as Record<string, unknown>;

    expect(result.accounts).toBeNull();
    expect(result.holdings).toBeNull();
    expect(result.liabilities).toBeNull();
    expect(result.accountsError).toBeTruthy();
    expect(result.holdingsError).toBeTruthy();
    expect(result.liabilitiesError).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tool descriptions
// ---------------------------------------------------------------------------

describe('tool descriptions', () => {
  it('getUserAccounts includes call-once guidance', () => {
    expect(getUserAccounts.description).toContain('Call once per session');
  });

  it('getUserHoldings includes call-once guidance', () => {
    expect(getUserHoldings.description).toContain('Call once per session');
  });

  it('getUserLiabilities includes call-once guidance', () => {
    expect(getUserLiabilities.description).toContain('Call once per session');
  });

  it('getUserProfile includes call-once guidance', () => {
    expect(getUserProfile.description).toContain('Call once per session');
  });

  it('getUserFinancialSnapshot includes preference guidance', () => {
    expect(getUserFinancialSnapshot.description).toContain('Prefer this over');
  });
});
