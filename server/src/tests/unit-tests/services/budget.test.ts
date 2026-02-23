/** Unit tests covering budgeting service */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

vi.mock('../../../lib/db.js', () => ({
  db: { send: vi.fn() },
}));

vi.mock('ulid', () => ({
  ulid: vi.fn(() => 'TESTULIDVALUE'),
}));

import { db } from '../../../lib/db.js';
import {
  createEmptyBudget,
  getBudget,
  analyzeAndPopulateBudget,
  updateBudget,
  confirmBudget,
  type Budget,
} from '../../../services/budget.js';

const mockSend = vi.mocked(db.send);

const USER_ID = 'user-abc';
const BUDGET_ID = 'budget#TESTULIDVALUE';

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    userId: USER_ID,
    budgetId: BUDGET_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    name: 'Monthly Budget',
    status: 'PENDING',
    income: { monthlyNet: null },
    needs: {
      housing: { rentOrMortgage: null },
      utilities: { utilities: null },
      transportation: { carPayment: null, gasFuel: null },
      other: { groceries: null, personalCare: null },
    },
    wants: { takeout: null, shopping: null },
    ...overrides,
  };
}

const PLAID_ITEM = {
  accessToken: 'access-sandbox-token',
  itemId: 'item-001',
  linkedAt: '2025-01-01T00:00:00.000Z',
};

describe('budget service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── createEmptyBudget ────────────────────────────────────────────────────

  describe('createEmptyBudget', () => {
    it('returns a budget with all null fields and PENDING status', async () => {
      mockSend.mockResolvedValueOnce({} as unknown as void);

      const budget = await createEmptyBudget(USER_ID);

      expect(budget.userId).toBe(USER_ID);
      expect(budget.budgetId).toBe(BUDGET_ID);
      expect(budget.name).toBe('Monthly Budget');
      expect(budget.status).toBe('PENDING');
      expect(budget.income.monthlyNet).toBeNull();
      expect(budget.needs.housing.rentOrMortgage).toBeNull();
      expect(budget.needs.utilities.utilities).toBeNull();
      expect(budget.needs.transportation.carPayment).toBeNull();
      expect(budget.needs.transportation.gasFuel).toBeNull();
      expect(budget.needs.other.groceries).toBeNull();
      expect(budget.needs.other.personalCare).toBeNull();
      expect(budget.wants.takeout).toBeNull();
      expect(budget.wants.shopping).toBeNull();
    });

    it('sets createdAt and updatedAt to the current time', async () => {
      mockSend.mockResolvedValueOnce({} as unknown as void);

      const before = Date.now();
      const budget = await createEmptyBudget(USER_ID);
      const after = Date.now();

      const createdAt = new Date(budget.createdAt).getTime();
      expect(createdAt).toBeGreaterThanOrEqual(before);
      expect(createdAt).toBeLessThanOrEqual(after);
      expect(budget.createdAt).toBe(budget.updatedAt);
    });

    it('persists the budget via PutCommand', async () => {
      mockSend.mockResolvedValueOnce({} as unknown as void);

      await createEmptyBudget(USER_ID);

      expect(mockSend).toHaveBeenCalledOnce();
      expect(mockSend).toHaveBeenCalledWith(expect.any(PutCommand));
    });
  });

  // ─── getBudget ────────────────────────────────────────────────────────────

  describe('getBudget', () => {
    it('returns null when no budget exists for the user', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] } as unknown as void);

      const result = await getBudget(USER_ID);

      expect(result).toBeNull();
    });

    it('returns null when Items is undefined', async () => {
      mockSend.mockResolvedValueOnce({} as unknown as void);

      const result = await getBudget(USER_ID);

      expect(result).toBeNull();
    });

    it('returns the budget when one is found', async () => {
      const budget = makeBudget({ income: { monthlyNet: 4000 } });
      mockSend.mockResolvedValueOnce({ Items: [budget] } as unknown as void);

      const result = await getBudget(USER_ID);

      expect(result).toEqual(budget);
    });

    it('returns only the first item (most recent) when multiple exist', async () => {
      const first = makeBudget({ name: 'First' });
      const second = makeBudget({ name: 'Second' });
      mockSend.mockResolvedValueOnce({ Items: [first, second] } as unknown as void);

      const result = await getBudget(USER_ID);

      expect(result?.name).toBe('First');
    });

    it('queries using a QueryCommand', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] } as unknown as void);

      await getBudget(USER_ID);

      expect(mockSend).toHaveBeenCalledWith(expect.any(QueryCommand));
    });
  });

  // ─── analyzeAndPopulateBudget ─────────────────────────────────────────────

  describe('analyzeAndPopulateBudget', () => {
    it('throws when no budget is found for the user', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] } as unknown as void);

      await expect(
        analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, [])
      ).rejects.toThrow('No budget found for user');
    });

    it('populates grocery spending from FOOD_AND_DRINK_GROCERIES transactions', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, [
        {
          transaction_id: 'tx1',
          amount: 150,
          date: '2025-01-15',
          merchant_name: 'Whole Foods',
          personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_GROCERIES' },
        },
        {
          transaction_id: 'tx2',
          amount: 50,
          date: '2025-01-20',
          merchant_name: 'Trader Joes',
          personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_GROCERIES' },
        },
      ]);

      expect(result.needs.other.groceries).toBe(200);
    });

    it('maps INCOME_SALARY transactions correctly (Plaid sends income as negative)', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, [
        {
          transaction_id: 'tx1',
          amount: -3500, // Plaid: negative = credit (income)
          date: '2025-01-01',
          merchant_name: 'Employer Inc',
          personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_SALARY' },
        },
      ]);

      expect(result.income.monthlyNet).toBe(3500);
    });

    it('maps FOOD_AND_DRINK_RESTAURANT and FOOD_AND_DRINK_FAST_FOOD to wants.takeout', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, [
        {
          transaction_id: 'tx1',
          amount: 45,
          date: '2025-01-10',
          merchant_name: 'Chipotle',
          personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_RESTAURANT' },
        },
        {
          transaction_id: 'tx2',
          amount: 12.5,
          date: '2025-01-11',
          merchant_name: "McDonald's",
          personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_FAST_FOOD' },
        },
      ]);

      expect(result.wants.takeout).toBe(57.5);
    });

    it('aggregates utility transactions from multiple subcategories into one field', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, [
        {
          transaction_id: 'tx1',
          amount: 80,
          date: '2025-01-05',
          merchant_name: 'ConEd',
          personal_finance_category: { primary: 'RENT_AND_UTILITIES', detailed: 'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY' },
        },
        {
          transaction_id: 'tx2',
          amount: 60,
          date: '2025-01-06',
          merchant_name: 'Comcast',
          personal_finance_category: { primary: 'RENT_AND_UTILITIES', detailed: 'RENT_AND_UTILITIES_INTERNET_AND_CABLE' },
        },
        {
          transaction_id: 'tx3',
          amount: 30,
          date: '2025-01-07',
          merchant_name: 'T-Mobile',
          personal_finance_category: { primary: 'RENT_AND_UTILITIES', detailed: 'RENT_AND_UTILITIES_TELEPHONE' },
        },
      ]);

      expect(result.needs.utilities.utilities).toBe(170);
    });

    it('maps RENT_AND_UTILITIES_WATER to needs.utilities.utilities', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, [
        {
          transaction_id: 'tx1',
          amount: 25,
          date: '2025-01-08',
          merchant_name: 'Water Dept',
          personal_finance_category: { primary: 'RENT_AND_UTILITIES', detailed: 'RENT_AND_UTILITIES_WATER' },
        },
      ]);

      expect(result.needs.utilities.utilities).toBe(25);
    });

    it('maps shopping transactions across multiple subcategories to wants.shopping', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, [
        {
          transaction_id: 'tx1',
          amount: 200,
          date: '2025-01-12',
          merchant_name: 'Amazon',
          personal_finance_category: { primary: 'GENERAL_MERCHANDISE', detailed: 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES' },
        },
        {
          transaction_id: 'tx2',
          amount: 75,
          date: '2025-01-13',
          merchant_name: 'Gap',
          personal_finance_category: { primary: 'GENERAL_MERCHANDISE', detailed: 'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES' },
        },
        {
          transaction_id: 'tx3',
          amount: 120,
          date: '2025-01-14',
          merchant_name: 'Target',
          personal_finance_category: { primary: 'GENERAL_MERCHANDISE', detailed: 'GENERAL_MERCHANDISE_SUPERSTORES' },
        },
      ]);

      expect(result.wants.shopping).toBe(395);
    });

    it('skips transactions with unknown categories', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, [
        {
          transaction_id: 'tx1',
          amount: 50,
          date: '2025-01-10',
          merchant_name: 'Some Vendor',
          personal_finance_category: { primary: 'OTHER', detailed: 'SOME_UNMAPPED_CATEGORY' },
        },
      ]);

      expect(result.wants.shopping).toBeNull();
      expect(result.needs.other.groceries).toBeNull();
    });

    it('skips transactions with no personal_finance_category', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, [
        {
          transaction_id: 'tx1',
          amount: 100,
          date: '2025-01-10',
          merchant_name: 'Mystery Store',
          personal_finance_category: null,
        },
      ]);

      expect(result.wants.shopping).toBeNull();
    });

    it('skips expense transactions with negative amounts (refunds)', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, [
        {
          transaction_id: 'tx1',
          amount: -25, // negative = credit/refund for expense category
          date: '2025-01-10',
          merchant_name: 'Amazon',
          personal_finance_category: { primary: 'GENERAL_MERCHANDISE', detailed: 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES' },
        },
      ]);

      expect(result.wants.shopping).toBeNull();
    });

    it('skips positive-amount income transactions (would be a debit from income category)', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, [
        {
          transaction_id: 'tx1',
          amount: 100, // positive income amount would become -100 after negation
          date: '2025-01-10',
          merchant_name: 'Odd Entry',
          personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_SALARY' },
        },
      ]);

      expect(result.income.monthlyNet).toBeNull();
    });

    it('rounds totals to 2 decimal places', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      // 10.005 + 20.006 = ~30.011 → rounded to 30.01
      const result = await analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, [
        {
          transaction_id: 'tx1',
          amount: 10.005,
          date: '2025-01-10',
          merchant_name: 'Whole Foods',
          personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_GROCERIES' },
        },
        {
          transaction_id: 'tx2',
          amount: 20.006,
          date: '2025-01-11',
          merchant_name: 'Trader Joes',
          personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_GROCERIES' },
        },
      ]);

      expect(result.needs.other.groceries).toBe(30.01);
    });

    it('sets budget status back to PENDING after analysis', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget({ status: 'REVIEWED' })] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, []);

      expect(result.status).toBe('PENDING');
    });

    it('makes exactly 3 db calls: query budget, put budget, update user', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      await analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, []);

      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(QueryCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(PutCommand));
      expect(mockSend).toHaveBeenNthCalledWith(3, expect.any(UpdateCommand));
    });

    it('uses if_not_exists in UpdateExpression so first-time users without a plaidItems attribute do not cause a DynamoDB error', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      await analyzeAndPopulateBudget(USER_ID, PLAID_ITEM, []);

      const updateCall = mockSend.mock.calls[2][0] as UpdateCommand;
      expect(updateCall.input.UpdateExpression).toContain(
        'list_append(if_not_exists(plaidItems, :emptyList), :newItems)'
      );
      expect(updateCall.input.ExpressionAttributeValues?.[':emptyList']).toEqual([]);
    });
  });

  // ─── updateBudget ─────────────────────────────────────────────────────────

  describe('updateBudget', () => {
    it('throws when the budget is not found', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] } as unknown as void);

      await expect(
        updateBudget(USER_ID, BUDGET_ID, { income: { monthlyNet: 5000 } })
      ).rejects.toThrow('Budget not found');
    });

    it('merges an income update into the existing budget', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await updateBudget(USER_ID, BUDGET_ID, {
        income: { monthlyNet: 5000 },
      });

      expect(result.income.monthlyNet).toBe(5000);
    });

    it('merges nested needs updates', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()]} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await updateBudget(USER_ID, BUDGET_ID, {
        needs: {
          housing: { rentOrMortgage: 1500 },
          utilities: { utilities: 200 },
          transportation: { carPayment: 400, gasFuel: 100 },
          other: { groceries: 600, personalCare: 50 },
        },
      });

      expect(result.needs.housing.rentOrMortgage).toBe(1500);
      expect(result.needs.utilities.utilities).toBe(200);
      expect(result.needs.transportation.carPayment).toBe(400);
      expect(result.needs.transportation.gasFuel).toBe(100);
      expect(result.needs.other.groceries).toBe(600);
      expect(result.needs.other.personalCare).toBe(50);
    });

    it('preserves sibling fields when only a partial nested object is sent', async () => {
      const existing = makeBudget({
        needs: {
          housing: { rentOrMortgage: 1200 },
          utilities: { utilities: 150 },
          transportation: { carPayment: 300, gasFuel: 80 },
          other: { groceries: 500, personalCare: 40 },
        },
      });
      mockSend
        .mockResolvedValueOnce({ Items: [existing] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await updateBudget(USER_ID, BUDGET_ID, {
        needs: { housing: { rentOrMortgage: 1500 } } as Budget['needs'],
      });

      expect(result.needs.housing.rentOrMortgage).toBe(1500);
      // siblings must survive the partial update
      expect(result.needs.utilities.utilities).toBe(150);
      expect(result.needs.transportation.carPayment).toBe(300);
      expect(result.needs.transportation.gasFuel).toBe(80);
      expect(result.needs.other.groceries).toBe(500);
      expect(result.needs.other.personalCare).toBe(40);
    });

    it('advances status from PENDING to REVIEWED', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget({ status: 'PENDING' })] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await updateBudget(USER_ID, BUDGET_ID, {});

      expect(result.status).toBe('REVIEWED');
    });

    it('keeps status at REVIEWED if already REVIEWED', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget({ status: 'REVIEWED' })] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await updateBudget(USER_ID, BUDGET_ID, {});

      expect(result.status).toBe('REVIEWED');
    });

    it('keeps status as CONFIRMED if already CONFIRMED', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget({ status: 'CONFIRMED' })] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await updateBudget(USER_ID, BUDGET_ID, {});

      expect(result.status).toBe('CONFIRMED');
    });

    it('preserves userId, budgetId, and createdAt regardless of what is passed in updates', async () => {
      const existing = makeBudget();
      mockSend
        .mockResolvedValueOnce({ Items: [existing] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await updateBudget(USER_ID, BUDGET_ID, {
        userId: 'attacker-id',
        budgetId: 'budget#DIFFERENT',
        createdAt: '1970-01-01T00:00:00.000Z',
      } as Partial<Budget>);

      expect(result.userId).toBe(USER_ID);
      expect(result.budgetId).toBe(BUDGET_ID);
      expect(result.createdAt).toBe(existing.createdAt);
    });

    it('updates the updatedAt timestamp', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget({ updatedAt: '2025-01-01T00:00:00.000Z' })] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const before = Date.now();
      const result = await updateBudget(USER_ID, BUDGET_ID, {});
      const after = Date.now();

      const updatedAt = new Date(result.updatedAt).getTime();
      expect(updatedAt).toBeGreaterThanOrEqual(before);
      expect(updatedAt).toBeLessThanOrEqual(after);
    });

    it('persists the merged budget via PutCommand', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [makeBudget()] } as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      await updateBudget(USER_ID, BUDGET_ID, { income: { monthlyNet: 4000 } });

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(QueryCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(PutCommand));
    });
  });

  // ─── confirmBudget ────────────────────────────────────────────────────────

  describe('confirmBudget', () => {
    it('issues two UpdateCommands: one for the budget and one for the user', async () => {
      mockSend
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      await confirmBudget(USER_ID, BUDGET_ID);

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(UpdateCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(UpdateCommand));
    });

    it('resolves without returning a value', async () => {
      mockSend
        .mockResolvedValueOnce({} as unknown as void)
        .mockResolvedValueOnce({} as unknown as void);

      const result = await confirmBudget(USER_ID, BUDGET_ID);

      expect(result).toBeUndefined();
    });

    it('propagates errors from DynamoDB', async () => {
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(confirmBudget(USER_ID, BUDGET_ID)).rejects.toThrow('DynamoDB error');
    });
  });
});
