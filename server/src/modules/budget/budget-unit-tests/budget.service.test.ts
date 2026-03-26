/**
 * @module budget.service.test
 * @description Unit tests for budget.service business logic.
 * The repository, transactions service, investments service, liabilities service,
 * and analysis module are all mocked so no real DynamoDB calls or computation occurs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestError, NotFoundError } from '../../../lib/errors.js';
import type { BudgetGoal } from '../budget.types.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../budget.repository.js', () => ({
  saveBudget: vi.fn(),
  getLatestBudget: vi.fn(),
  getBudgetHistory: vi.fn(),
}));

vi.mock('../../transactions/transactions.service.js', () => ({
  getTransactionsSince: vi.fn(),
}));

vi.mock('../../investments/investments.service.js', () => ({
  getTransactionsSince: vi.fn(),
}));

vi.mock('../../liabilities/liabilities.service.js', () => ({
  getLiabilitiesForUser: vi.fn(),
}));

vi.mock('../budget.analysis.js', () => ({
  generateBudgetFromHistory: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  createInitialBudget,
  updateBudget,
  getLatestBudget,
  getBudgetHistory,
} from '../budget.service.js';
import * as repo from '../budget.repository.js';
import * as txService from '../../transactions/transactions.service.js';
import * as investmentsService from '../../investments/investments.service.js';
import * as liabilitiesService from '../../liabilities/liabilities.service.js';
import * as analysis from '../budget.analysis.js';
import type { Budget, BudgetUpdateInput } from '../budget.types.js';

const mockSaveBudget = vi.mocked(repo.saveBudget);
const mockGetLatestBudget = vi.mocked(repo.getLatestBudget);
const mockGetBudgetHistory = vi.mocked(repo.getBudgetHistory);
const mockGetTransactionsSince = vi.mocked(txService.getTransactionsSince);
const mockGetInvestmentTransactionsSince = vi.mocked(investmentsService.getTransactionsSince);
const mockGetLiabilitiesForUser = vi.mocked(liabilitiesService.getLiabilitiesForUser);
const mockGenerateBudgetFromHistory = vi.mocked(analysis.generateBudgetFromHistory);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const testGoals: BudgetGoal[] = ['pay down debt', 'maximize investments'];

const sampleBudget: Budget = {
  userId: 'user-svc-1',
  budgetId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  createdAt: '2024-01-01T00:00:00.000Z',
  income: { amount: 5000 },
  housing: { amount: 1500 },
  utilities: { amount: 200 },
  transportation: { amount: 300 },
  groceries: { amount: 400 },
  takeout: { amount: 150 },
  shopping: { amount: 250 },
  personalCare: { amount: 100 },
  emergencyFund: { amount: 0 },
  entertainment: { amount: 0 },
  medical: { amount: 0 },
  debts: { amount: 500 },
  investments: { amount: 300 },
  goals: testGoals,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTransactionsSince.mockResolvedValue([]);
  mockGetInvestmentTransactionsSince.mockResolvedValue([]);
  mockGetLiabilitiesForUser.mockResolvedValue([]);
  mockSaveBudget.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// createInitialBudget
// ---------------------------------------------------------------------------

describe('createInitialBudget', () => {
  it('throws BadRequestError when goals array is empty', async () => {
    await expect(createInitialBudget('user-svc-1', [])).rejects.toThrow(BadRequestError);
  });

  it('returns the existing budget without generating a new one when one already exists', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);

    const result = await createInitialBudget('user-svc-1', testGoals);

    expect(result).toEqual(sampleBudget);
    expect(mockSaveBudget).not.toHaveBeenCalled();
    expect(mockGenerateBudgetFromHistory).not.toHaveBeenCalled();
  });

  it('skips fetching transactions when a budget already exists', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);

    await createInitialBudget('user-svc-1', testGoals);

    expect(mockGetTransactionsSince).not.toHaveBeenCalled();
  });

  it('fetches transactions since 2000-01-01 (effectively all-time) when no budget exists', async () => {
    mockGetLatestBudget.mockResolvedValue(null);
    mockGenerateBudgetFromHistory.mockReturnValue(sampleBudget);

    await createInitialBudget('user-svc-1', testGoals);

    expect(mockGetTransactionsSince).toHaveBeenCalledWith('user-svc-1', '2000-01-01');
  });

  it('fetches investment transactions since 2000-01-01 when no budget exists', async () => {
    mockGetLatestBudget.mockResolvedValue(null);
    mockGenerateBudgetFromHistory.mockReturnValue(sampleBudget);

    await createInitialBudget('user-svc-1', testGoals);

    expect(mockGetInvestmentTransactionsSince).toHaveBeenCalledWith('user-svc-1', '2000-01-01');
  });

  it('fetches liabilities for the user when no budget exists', async () => {
    mockGetLatestBudget.mockResolvedValue(null);
    mockGenerateBudgetFromHistory.mockReturnValue(sampleBudget);

    await createInitialBudget('user-svc-1', testGoals);

    expect(mockGetLiabilitiesForUser).toHaveBeenCalledWith('user-svc-1');
  });

  it('passes userId, transactions, liabilities, and investmentTransactions to generateBudgetFromHistory', async () => {
    mockGetLatestBudget.mockResolvedValue(null);
    const fakeTxs = [{ plaidTransactionId: 'tx-1' }] as never;
    const fakeInvTxs = [{ investmentTransactionId: 'inv-1' }] as never;
    const fakeLiabilities = [{ liabilityType: 'credit' }] as never;
    mockGetTransactionsSince.mockResolvedValue(fakeTxs);
    mockGetInvestmentTransactionsSince.mockResolvedValue(fakeInvTxs);
    mockGetLiabilitiesForUser.mockResolvedValue(fakeLiabilities);
    mockGenerateBudgetFromHistory.mockReturnValue(sampleBudget);

    await createInitialBudget('user-svc-1', testGoals);

    expect(mockGenerateBudgetFromHistory).toHaveBeenCalledWith({
      userId: 'user-svc-1',
      transactions: fakeTxs,
      liabilities: fakeLiabilities,
      investmentTransactions: fakeInvTxs,
      goals: testGoals,
    });
  });

  it('saves the newly generated budget to the repository', async () => {
    mockGetLatestBudget.mockResolvedValue(null);
    mockGenerateBudgetFromHistory.mockReturnValue(sampleBudget);

    await createInitialBudget('user-svc-1', testGoals);

    expect(mockSaveBudget).toHaveBeenCalledWith(sampleBudget);
  });

  it('returns the generated budget', async () => {
    mockGetLatestBudget.mockResolvedValue(null);
    mockGenerateBudgetFromHistory.mockReturnValue(sampleBudget);

    const result = await createInitialBudget('user-svc-1', testGoals);

    expect(result).toEqual(sampleBudget);
  });
});

// ---------------------------------------------------------------------------
// updateBudget
// ---------------------------------------------------------------------------

describe('updateBudget', () => {
  it('throws NotFoundError when no budget exists for the user', async () => {
    mockGetLatestBudget.mockResolvedValue(null);

    await expect(updateBudget('user-svc-1', { groceries: { amount: 500 } })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('does not call saveBudget when no budget exists', async () => {
    mockGetLatestBudget.mockResolvedValue(null);

    await expect(updateBudget('user-svc-1', {})).rejects.toThrow(NotFoundError);
    expect(mockSaveBudget).not.toHaveBeenCalled();
  });

  it('merges the update fields onto the existing budget', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);
    const update: BudgetUpdateInput = { groceries: { amount: 999 } };

    await updateBudget('user-svc-1', update);

    const saved = mockSaveBudget.mock.calls[0][0];
    expect(saved.groceries.amount).toBe(999);
  });

  it('preserves unchanged category fields from the existing budget', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);

    await updateBudget('user-svc-1', { groceries: { amount: 999 } });

    const saved = mockSaveBudget.mock.calls[0][0];
    expect(saved.housing.amount).toBe(1500);
    expect(saved.income.amount).toBe(5000);
  });

  it('assigns a new ULID budgetId that differs from the original', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);

    await updateBudget('user-svc-1', {});

    const saved = mockSaveBudget.mock.calls[0][0];
    expect(saved.budgetId).not.toBe(sampleBudget.budgetId);
    expect(typeof saved.budgetId).toBe('string');
    expect(saved.budgetId.length).toBeGreaterThan(0);
  });

  it('updates createdAt to a timestamp at or after the call time', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);
    const before = new Date().toISOString();

    await updateBudget('user-svc-1', {});

    const saved = mockSaveBudget.mock.calls[0][0];
    expect(saved.createdAt >= before).toBe(true);
  });

  it('preserves userId from the existing budget (never overwritten)', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);

    await updateBudget('user-svc-1', {});

    const saved = mockSaveBudget.mock.calls[0][0];
    expect(saved.userId).toBe('user-svc-1');
  });

  it('calls saveBudget exactly once with the merged budget', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);

    await updateBudget('user-svc-1', { housing: { amount: 2000 } });

    expect(mockSaveBudget).toHaveBeenCalledTimes(1);
  });

  it('returns the merged budget including the update', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);

    const result = await updateBudget('user-svc-1', { groceries: { amount: 999 } });

    expect(result.groceries.amount).toBe(999);
    expect(result.userId).toBe('user-svc-1');
  });

  it('can update multiple categories in a single call', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);

    await updateBudget('user-svc-1', { groceries: { amount: 999 }, housing: { amount: 2500 } });

    const saved = mockSaveBudget.mock.calls[0][0];
    expect(saved.groceries.amount).toBe(999);
    expect(saved.housing.amount).toBe(2500);
  });

  it('merges goals onto the existing budget', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);
    const update: BudgetUpdateInput = { goals: ['pay down debt', 'save for big purchase'] };

    await updateBudget('user-svc-1', update);

    const saved = mockSaveBudget.mock.calls[0][0];
    expect(saved.goals).toEqual(['pay down debt', 'save for big purchase']);
  });

  it('preserves existing goals when updating only categories', async () => {
    const budgetWithGoals = { ...sampleBudget, goals: ['maximize investments'] as BudgetGoal[] };
    mockGetLatestBudget.mockResolvedValue(budgetWithGoals);

    await updateBudget('user-svc-1', { groceries: { amount: 999 } });

    const saved = mockSaveBudget.mock.calls[0][0];
    expect(saved.goals).toEqual(['maximize investments']);
  });
});

// ---------------------------------------------------------------------------
// getLatestBudget
// ---------------------------------------------------------------------------

describe('getLatestBudget', () => {
  it('delegates to the repository with the userId', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);

    const result = await getLatestBudget('user-svc-1');

    expect(mockGetLatestBudget).toHaveBeenCalledWith('user-svc-1');
    expect(result).toEqual(sampleBudget);
  });

  it('returns null when the repository returns null', async () => {
    mockGetLatestBudget.mockResolvedValue(null);

    const result = await getLatestBudget('user-svc-1');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getBudgetHistory
// ---------------------------------------------------------------------------

describe('getBudgetHistory', () => {
  it('delegates to the repository with the userId', async () => {
    mockGetBudgetHistory.mockResolvedValue([sampleBudget]);

    const result = await getBudgetHistory('user-svc-1');

    expect(mockGetBudgetHistory).toHaveBeenCalledWith('user-svc-1');
    expect(result).toEqual([sampleBudget]);
  });

  it('returns an empty array when the repository returns none', async () => {
    mockGetBudgetHistory.mockResolvedValue([]);

    const result = await getBudgetHistory('user-svc-1');

    expect(result).toEqual([]);
  });
});
