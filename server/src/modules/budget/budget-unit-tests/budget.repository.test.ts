/**
 * @module budget.repository.test
 * @description Unit tests for budget.repository — DynamoDB PutCommand / QueryCommand logic.
 * The db client is fully mocked so no real DynamoDB calls occur.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factory — must exist before vi.mock() factory functions run
// ---------------------------------------------------------------------------

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../db/index.js', () => ({ db: { send: mockSend } }));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { saveBudget, getLatestBudget, getBudgetHistory } from '../budget.repository.js';
import { BadRequestError } from '../../../lib/errors.js';
import type { Budget } from '../budget.types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleBudget: Budget = {
  userId: 'user-repo-1',
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
  goals: ['pay down debt'],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// saveBudget
// ---------------------------------------------------------------------------

describe('saveBudget', () => {
  it('throws BadRequestError when goals is empty', async () => {
    const budgetNoGoals = { ...sampleBudget, goals: [] };

    await expect(saveBudget(budgetNoGoals)).rejects.toThrow(BadRequestError);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('calls db.send exactly once', async () => {
    mockSend.mockResolvedValue({});

    await saveBudget(sampleBudget);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('stores the budget in the Budgets table', async () => {
    mockSend.mockResolvedValue({});

    await saveBudget(sampleBudget);

    const command = mockSend.mock.calls[0][0];
    expect(command.input.TableName).toBe('Budgets');
  });

  it('stores the full budget item including userId and budgetId', async () => {
    mockSend.mockResolvedValue({});

    await saveBudget(sampleBudget);

    const command = mockSend.mock.calls[0][0];
    expect(command.input.Item).toMatchObject({
      userId: 'user-repo-1',
      budgetId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    });
  });

  it('stores all category fields on the item', async () => {
    mockSend.mockResolvedValue({});

    await saveBudget(sampleBudget);

    const command = mockSend.mock.calls[0][0];
    expect(command.input.Item.groceries).toEqual({ amount: 400 });
    expect(command.input.Item.income).toEqual({ amount: 5000 });
  });
});

// ---------------------------------------------------------------------------
// getLatestBudget
// ---------------------------------------------------------------------------

describe('getLatestBudget', () => {
  it('returns null when no budget exists for the user', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    const result = await getLatestBudget('user-repo-1');

    expect(result).toBeNull();
  });

  it('returns the budget when one exists', async () => {
    mockSend.mockResolvedValue({ Items: [sampleBudget] });

    const result = await getLatestBudget('user-repo-1');

    expect(result).toMatchObject({ userId: 'user-repo-1', budgetId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' });
  });

  it('queries the Budgets table with the userId', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await getLatestBudget('user-repo-1');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.TableName).toBe('Budgets');
    // userId must appear as an expression attribute value
    expect(Object.values(command.input.ExpressionAttributeValues)).toContain('user-repo-1');
  });

  it('uses ScanIndexForward: false to return the newest record first', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await getLatestBudget('user-repo-1');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.ScanIndexForward).toBe(false);
  });

  it('uses Limit: 1 to fetch only the most recent budget', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await getLatestBudget('user-repo-1');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.Limit).toBe(1);
  });

  it('returns null when Items is undefined in the response', async () => {
    mockSend.mockResolvedValue({});

    const result = await getLatestBudget('user-repo-1');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getBudgetHistory
// ---------------------------------------------------------------------------

describe('getBudgetHistory', () => {
  it('returns an empty array when no budgets exist', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    const result = await getBudgetHistory('user-repo-1');

    expect(result).toEqual([]);
  });

  it('returns all budgets for the user', async () => {
    const second: Budget = { ...sampleBudget, budgetId: '02ARZ3NDEKTSV4RRFFQ69G5FAV' };
    mockSend.mockResolvedValue({ Items: [second, sampleBudget] });

    const result = await getBudgetHistory('user-repo-1');

    expect(result).toHaveLength(2);
  });

  it('queries the Budgets table', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await getBudgetHistory('user-repo-1');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.TableName).toBe('Budgets');
  });

  it('uses ScanIndexForward: false (newest first)', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await getBudgetHistory('user-repo-1');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.ScanIndexForward).toBe(false);
  });

  it('does not set Limit (returns all records, not just one)', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await getBudgetHistory('user-repo-1');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.Limit).toBeUndefined();
  });

  it('returns an empty array when Items is undefined in the response', async () => {
    mockSend.mockResolvedValue({});

    const result = await getBudgetHistory('user-repo-1');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deleteAllBudgetsForUser
// ---------------------------------------------------------------------------

describe('deleteAllBudgetsForUser', () => {
  it('does nothing when the user has no budgets', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    await deleteAllBudgetsForUser('user-repo-1');

    // Only the query — no deletes
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('issues one DeleteCommand per budget', async () => {
    const second: Budget = { ...sampleBudget, budgetId: '02ARZ3NDEKTSV4RRFFQ69G5FAV' };
    mockSend
      .mockResolvedValueOnce({ Items: [sampleBudget, second] })
      .mockResolvedValue({});

    await deleteAllBudgetsForUser('user-repo-1');

    // 1 query + 2 deletes
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it('deletes from the Budgets table', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleBudget] })
      .mockResolvedValue({});

    await deleteAllBudgetsForUser('user-repo-1');

    const deleteCall = mockSend.mock.calls[1][0];
    expect(deleteCall.input.TableName).toBe('Budgets');
  });

  it('uses the composite key { userId, budgetId } for deletion', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleBudget] })
      .mockResolvedValue({});

    await deleteAllBudgetsForUser('user-repo-1');

    const deleteCall = mockSend.mock.calls[1][0];
    expect(deleteCall.input.Key).toEqual({
      userId: 'user-repo-1',
      budgetId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    });
  });
});
