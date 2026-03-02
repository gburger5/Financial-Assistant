/**
 * @module budget.analysis.test
 * @description Unit tests for budget.analysis pure functions.
 * No mocking — these functions are side-effect-free: no I/O, no DB calls.
 */
import { describe, it, expect } from 'vitest';
import {
  round,
  computeMonthsOfData,
  computeAverageMonthly,
  computeTotalMinimumPayments,
  generateBudgetFromHistory,
} from '../budget.analysis.js';
import type { Transaction } from '../../transactions/transactions.types.js';
import type {
  Liability,
  CreditLiability,
  StudentLiability,
  MortgageLiability,
} from '../../liabilities/liabilities.types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Builds a minimal Transaction fixture with sensible defaults. */
function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    userId: 'user-analysis-1',
    sortKey: '2024-01-15#tx-001',
    plaidTransactionId: 'tx-001',
    plaidAccountId: 'acc-001',
    amount: 50,
    date: '2024-01-15',
    name: 'Test Transaction',
    merchantName: null,
    category: 'FOOD_AND_DRINK',
    detailedCategory: 'FOOD_AND_DRINK_GROCERIES',
    categoryIconUrl: null,
    pending: false,
    isoCurrencyCode: 'USD',
    unofficialCurrencyCode: null,
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
    ...overrides,
  };
}

function makeCreditLiability(minimumPaymentAmount: number | null): CreditLiability {
  return {
    userId: 'user-analysis-1',
    plaidAccountId: 'acc-credit-1',
    liabilityType: 'credit',
    currentBalance: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    details: {
      minimumPaymentAmount,
      nextPaymentDueDate: null,
      lastPaymentAmount: null,
      lastStatementBalance: null,
      aprs: [],
    },
  };
}

function makeStudentLiability(minimumPaymentAmount: number | null): StudentLiability {
  return {
    userId: 'user-analysis-1',
    plaidAccountId: 'acc-student-1',
    liabilityType: 'student',
    currentBalance: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    details: {
      outstandingInterestAmount: null,
      outstandingPrincipalAmount: null,
      originationPrincipalAmount: null,
      interestRatePercentage: null,
      minimumPaymentAmount,
      servicerAddress: null,
      repaymentPlan: null,
      sequenceNumber: null,
    },
  };
}

function makeMortgageLiability(nextMonthlyPayment: number | null): MortgageLiability {
  return {
    userId: 'user-analysis-1',
    plaidAccountId: 'acc-mortgage-1',
    liabilityType: 'mortgage',
    currentBalance: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    details: {
      outstandingPrincipalBalance: null,
      interestRatePercentage: null,
      nextMonthlyPayment,
      originationDate: null,
      maturityDate: null,
      propertyAddress: null,
      escrowBalance: null,
      hasPmi: null,
      hasPrepaymentPenalty: null,
    },
  };
}

// ---------------------------------------------------------------------------
// round
// ---------------------------------------------------------------------------

describe('round', () => {
  it('rounds 1.005 up to 1.01', () => {
    expect(round(1.005)).toBe(1.01);
  });

  it('rounds 1.004 down to 1', () => {
    expect(round(1.004)).toBe(1);
  });

  it('leaves already-rounded values unchanged', () => {
    expect(round(3.14)).toBe(3.14);
  });

  it('handles whole numbers', () => {
    expect(round(42)).toBe(42);
  });

  it('handles zero', () => {
    expect(round(0)).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(round(-1.005)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// computeMonthsOfData
// ---------------------------------------------------------------------------

describe('computeMonthsOfData', () => {
  it('returns 1 for an empty transaction list (prevents division by zero)', () => {
    expect(computeMonthsOfData([])).toBe(1);
  });

  it('returns 1 for a single transaction', () => {
    const txs = [makeTransaction({ date: '2024-01-15' })];
    expect(computeMonthsOfData(txs)).toBe(1);
  });

  it('returns at least 1 for transactions all in the same month', () => {
    const txs = [
      makeTransaction({ date: '2024-01-01' }),
      makeTransaction({ date: '2024-01-31' }),
    ];
    expect(computeMonthsOfData(txs)).toBeGreaterThanOrEqual(1);
  });

  it('returns more than 1 when transactions span multiple months', () => {
    const txs = [
      makeTransaction({ date: '2024-01-01' }),
      makeTransaction({ date: '2024-07-01' }),
    ];
    expect(computeMonthsOfData(txs)).toBeGreaterThan(1);
  });

  it('derives range from actual earliest and latest transaction dates', () => {
    // 12-month span: Jan 2023 to Jan 2024
    const txs = [
      makeTransaction({ date: '2023-01-01' }),
      makeTransaction({ date: '2023-06-15' }),
      makeTransaction({ date: '2024-01-01' }),
    ];
    const result = computeMonthsOfData(txs);
    // ~12 months, must be > 1
    expect(result).toBeGreaterThan(1);
  });

  it('is not affected by transaction order (uses min/max dates)', () => {
    const ordered = [
      makeTransaction({ date: '2024-01-01' }),
      makeTransaction({ date: '2024-06-01' }),
    ];
    const reversed = [
      makeTransaction({ date: '2024-06-01' }),
      makeTransaction({ date: '2024-01-01' }),
    ];
    expect(computeMonthsOfData(ordered)).toBe(computeMonthsOfData(reversed));
  });
});

// ---------------------------------------------------------------------------
// computeAverageMonthly
// ---------------------------------------------------------------------------

describe('computeAverageMonthly', () => {
  it('returns 0 when no transactions match the category list', () => {
    const txs = [makeTransaction({ detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 100 })];
    expect(computeAverageMonthly(txs, ['TRANSPORTATION_GAS'], false)).toBe(0);
  });

  it('returns 0 when the transaction list is empty', () => {
    expect(computeAverageMonthly([], ['FOOD_AND_DRINK_GROCERIES'], false)).toBe(0);
  });

  it('sums amounts for matching categories and divides by months of data', () => {
    // Two separate months, $30 each = $60 total over ~1 month window
    // Single month → months = 1, so result should be close to 60
    const txs = [
      makeTransaction({ date: '2024-01-10', detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 30 }),
      makeTransaction({ date: '2024-01-20', detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 30 }),
    ];
    const result = computeAverageMonthly(txs, ['FOOD_AND_DRINK_GROCERIES'], false);
    expect(result).toBeGreaterThan(0);
  });

  it('ignores transactions whose detailedCategory is not in the category list', () => {
    const txs = [
      makeTransaction({ detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 100 }),
      makeTransaction({ detailedCategory: 'TRANSPORTATION_GAS', amount: 50 }),
    ];
    const groceriesOnly = computeAverageMonthly(txs, ['FOOD_AND_DRINK_GROCERIES'], false);
    const both = computeAverageMonthly(
      txs,
      ['FOOD_AND_DRINK_GROCERIES', 'TRANSPORTATION_GAS'],
      false,
    );
    // Counting both categories should produce a larger result
    expect(groceriesOnly).toBeLessThan(both);
  });

  it('flips the sign when flipSign is true (income = negative in Plaid convention)', () => {
    const txs = [makeTransaction({ detailedCategory: 'INCOME_SALARY', amount: -3000 })];
    const flipped = computeAverageMonthly(txs, ['INCOME_SALARY'], true);
    const notFlipped = computeAverageMonthly(txs, ['INCOME_SALARY'], false);
    expect(flipped).toBeGreaterThan(0);
    expect(notFlipped).toBeLessThanOrEqual(0);
  });

  it('does not flip the sign when flipSign is false', () => {
    const txs = [makeTransaction({ detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 100 })];
    const result = computeAverageMonthly(txs, ['FOOD_AND_DRINK_GROCERIES'], false);
    expect(result).toBeGreaterThan(0);
  });

  it('skips transactions with null detailedCategory without throwing', () => {
    const txs = [
      makeTransaction({ detailedCategory: null, amount: 999 }),
      makeTransaction({ detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 100 }),
    ];
    expect(() =>
      computeAverageMonthly(txs, ['FOOD_AND_DRINK_GROCERIES'], false),
    ).not.toThrow();
  });

  it('counts only matching transactions when some have null detailedCategory', () => {
    const txs = [
      makeTransaction({ detailedCategory: null, amount: 999 }),
      makeTransaction({ detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 100 }),
    ];
    const withNull = computeAverageMonthly(txs, ['FOOD_AND_DRINK_GROCERIES'], false);
    const withoutNull = computeAverageMonthly(
      [makeTransaction({ detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 100 })],
      ['FOOD_AND_DRINK_GROCERIES'],
      false,
    );
    expect(withNull).toBe(withoutNull);
  });

  it('returns a value rounded to 2 decimal places', () => {
    const txs = [
      makeTransaction({ date: '2024-01-01', detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 10 }),
      makeTransaction({ date: '2024-04-01', detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 10 }),
      makeTransaction({ date: '2024-07-01', detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 11 }),
    ];
    const result = computeAverageMonthly(txs, ['FOOD_AND_DRINK_GROCERIES'], false);
    expect(result).toBe(parseFloat(result.toFixed(2)));
  });

  it('handles multiple categories in the list simultaneously', () => {
    const txs = [
      makeTransaction({ detailedCategory: 'FOOD_AND_DRINK_RESTAURANT', amount: 40 }),
      makeTransaction({ detailedCategory: 'FOOD_AND_DRINK_FAST_FOOD', amount: 20 }),
      makeTransaction({ detailedCategory: 'FOOD_AND_DRINK_COFFEE', amount: 10 }),
    ];
    const result = computeAverageMonthly(
      txs,
      ['FOOD_AND_DRINK_RESTAURANT', 'FOOD_AND_DRINK_FAST_FOOD', 'FOOD_AND_DRINK_COFFEE'],
      false,
    );
    expect(result).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// computeTotalMinimumPayments
// ---------------------------------------------------------------------------

describe('computeTotalMinimumPayments', () => {
  it('returns 0 for an empty liabilities list', () => {
    expect(computeTotalMinimumPayments([])).toBe(0);
  });

  it('sums minimumPaymentAmount from credit liabilities', () => {
    const liabilities: Liability[] = [makeCreditLiability(250)];
    expect(computeTotalMinimumPayments(liabilities)).toBe(250);
  });

  it('sums minimumPaymentAmount from student liabilities', () => {
    const liabilities: Liability[] = [makeStudentLiability(300)];
    expect(computeTotalMinimumPayments(liabilities)).toBe(300);
  });

  it('sums nextMonthlyPayment from mortgage liabilities', () => {
    const liabilities: Liability[] = [makeMortgageLiability(1200)];
    expect(computeTotalMinimumPayments(liabilities)).toBe(1200);
  });

  it('sums across all three liability types', () => {
    const liabilities: Liability[] = [
      makeCreditLiability(250),
      makeStudentLiability(300),
      makeMortgageLiability(1200),
    ];
    expect(computeTotalMinimumPayments(liabilities)).toBe(1750);
  });

  it('treats null minimum payment amounts as 0', () => {
    const liabilities: Liability[] = [
      makeCreditLiability(null),
      makeStudentLiability(null),
      makeMortgageLiability(null),
    ];
    expect(computeTotalMinimumPayments(liabilities)).toBe(0);
  });

  it('handles mixed null and non-null payments', () => {
    const liabilities: Liability[] = [
      makeCreditLiability(100),
      makeCreditLiability(null),
      makeStudentLiability(200),
    ];
    expect(computeTotalMinimumPayments(liabilities)).toBe(300);
  });

  it('sums multiple liabilities of the same type', () => {
    const liabilities: Liability[] = [
      makeCreditLiability(100),
      makeCreditLiability(150),
    ];
    expect(computeTotalMinimumPayments(liabilities)).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// generateBudgetFromHistory
// ---------------------------------------------------------------------------

describe('generateBudgetFromHistory', () => {
  const userId = 'user-generate-1';

  it('returns a Budget with the provided userId', () => {
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [] });
    expect(budget.userId).toBe(userId);
  });

  it('returns a Budget with a non-empty ULID budgetId', () => {
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [] });
    expect(typeof budget.budgetId).toBe('string');
    expect(budget.budgetId.length).toBeGreaterThan(0);
  });

  it('generates a unique budgetId on each call (ULID uniqueness)', () => {
    const a = generateBudgetFromHistory({ userId, transactions: [], liabilities: [] });
    const b = generateBudgetFromHistory({ userId, transactions: [], liabilities: [] });
    expect(a.budgetId).not.toBe(b.budgetId);
  });

  it('returns a valid ISO timestamp for createdAt', () => {
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [] });
    expect(() => new Date(budget.createdAt)).not.toThrow();
    expect(new Date(budget.createdAt).toISOString()).toBe(budget.createdAt);
  });

  it('sets all category amounts to 0 when there are no transactions and no liabilities', () => {
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [] });
    const categories = [
      'income', 'housing', 'utilities', 'transportation', 'groceries',
      'takeout', 'shopping', 'personalCare', 'investments',
    ] as const;
    for (const cat of categories) {
      expect(budget[cat].amount).toBe(0);
    }
  });

  it('sets debts.amount to 0 when there are no liabilities', () => {
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [] });
    expect(budget.debts.amount).toBe(0);
  });

  it('sets debts.amount from liabilities minimum payments, not transactions', () => {
    const liabilities: Liability[] = [makeCreditLiability(500)];
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities });
    expect(budget.debts.amount).toBe(500);
  });

  it('computes groceries from FOOD_AND_DRINK_GROCERIES transactions', () => {
    const txs = [makeTransaction({ detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 120 })];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [] });
    expect(budget.groceries.amount).toBeGreaterThan(0);
  });

  it('computes income with flipped sign (Plaid income transactions have negative amounts)', () => {
    const txs = [makeTransaction({ detailedCategory: 'INCOME_SALARY', amount: -3000 })];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [] });
    expect(budget.income.amount).toBeGreaterThan(0);
  });

  it('returns BudgetAmount objects for all 10 required categories', () => {
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [] });
    const requiredCategories = [
      'income', 'housing', 'utilities', 'transportation', 'groceries',
      'takeout', 'shopping', 'personalCare', 'debts', 'investments',
    ] as const;
    for (const cat of requiredCategories) {
      expect(budget).toHaveProperty(cat);
      expect(typeof budget[cat].amount).toBe('number');
    }
  });

  it('routes LOAN_PAYMENTS_CAR_PAYMENT to transportation, not debts', () => {
    // Car payment is in CATEGORY_MAP.transportation — debts comes from liabilities only
    const txs = [makeTransaction({ detailedCategory: 'LOAN_PAYMENTS_CAR_PAYMENT', amount: 400 })];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [] });
    expect(budget.debts.amount).toBe(0);
    expect(budget.transportation.amount).toBeGreaterThan(0);
  });

  it('sums all liability types into debts.amount', () => {
    const liabilities: Liability[] = [
      makeCreditLiability(100),
      makeStudentLiability(200),
      makeMortgageLiability(1000),
    ];
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities });
    expect(budget.debts.amount).toBe(1300);
  });
});
