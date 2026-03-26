/**
 * @module budget.analysis.test
 * @description Unit tests for budget.analysis pure functions.
 * No mocking — these functions are side-effect-free: no I/O, no DB calls.
 */
import { describe, it, expect } from 'vitest';
import {
  round,
  computeTotalMinimumPayments,
  generateBudgetFromHistory,
} from '../budget.analysis.js';
import type { Transaction } from '../../transactions/transactions.types.js';
import type { InvestmentTransaction } from '../../investments/investments.types.js';
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

/** Builds a minimal InvestmentTransaction fixture. */
function makeInvestmentTransaction(overrides: Partial<InvestmentTransaction> = {}): InvestmentTransaction {
  return {
    userId: 'user-analysis-1',
    dateTransactionId: '2024-01-15#inv-tx-001',
    investmentTransactionId: 'inv-tx-001',
    plaidAccountId: 'acc-inv-001',
    securityId: 'sec-001',
    date: '2024-01-15',
    name: 'Vanguard S&P 500',
    quantity: 1,
    amount: 500,
    price: 500,
    fees: 0,
    type: 'buy',
    subtype: 'buy',
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
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [], goals: ['pay down debt'] });
    expect(budget.userId).toBe(userId);
  });

  it('returns a Budget with a non-empty ULID budgetId', () => {
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [], goals: ['pay down debt'] });
    expect(typeof budget.budgetId).toBe('string');
    expect(budget.budgetId.length).toBeGreaterThan(0);
  });

  it('generates a unique budgetId on each call (ULID uniqueness)', () => {
    const a = generateBudgetFromHistory({ userId, transactions: [], liabilities: [], goals: ['pay down debt'] });
    const b = generateBudgetFromHistory({ userId, transactions: [], liabilities: [], goals: ['pay down debt'] });
    expect(a.budgetId).not.toBe(b.budgetId);
  });

  it('returns a valid ISO timestamp for createdAt', () => {
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [], goals: ['pay down debt'] });
    expect(() => new Date(budget.createdAt)).not.toThrow();
    expect(new Date(budget.createdAt).toISOString()).toBe(budget.createdAt);
  });

  it('sets all category amounts to 0 when there are no transactions and no liabilities', () => {
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [], goals: ['pay down debt'] });
    const categories = [
      'income', 'housing', 'utilities', 'transportation', 'groceries',
      'takeout', 'shopping', 'personalCare', 'emergencyFund', 'entertainment',
      'medical', 'investments',
    ] as const;
    for (const cat of categories) {
      expect(budget[cat].amount).toBe(0);
    }
  });

  it('sets debts.amount to 0 when there are no liabilities', () => {
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [], goals: ['pay down debt'] });
    expect(budget.debts.amount).toBe(0);
  });

  it('sets debts.amount from liabilities minimum payments, not transactions', () => {
    const liabilities: Liability[] = [makeCreditLiability(500)];
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities, goals: ['pay down debt'] });
    expect(budget.debts.amount).toBe(500);
  });

  it('computes groceries from FOOD_AND_DRINK_GROCERIES transactions', () => {
    const txs = [makeTransaction({ detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 120 })];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [], goals: ['pay down debt'] });
    expect(budget.groceries.amount).toBe(120);
  });

  it('computes income with flipped sign (Plaid income transactions have negative amounts)', () => {
    const txs = [makeTransaction({ detailedCategory: 'INCOME_SALARY', amount: -3000 })];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [], goals: ['pay down debt'] });
    expect(budget.income.amount).toBe(3000);
  });

  it('returns BudgetAmount objects for all 13 required categories', () => {
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [], goals: ['pay down debt'] });
    const requiredCategories = [
      'income', 'housing', 'utilities', 'transportation', 'groceries',
      'takeout', 'shopping', 'personalCare', 'emergencyFund', 'entertainment',
      'medical', 'debts', 'investments',
    ] as const;
    for (const cat of requiredCategories) {
      expect(budget).toHaveProperty(cat);
      expect(typeof budget[cat].amount).toBe('number');
    }
  });

  it('does not route LOAN_PAYMENTS categories to debts — debts come from liabilities only', () => {
    // LOAN_PAYMENTS_* categories are absent from CATEGORY_MAP so they have no effect
    const txs = [makeTransaction({ detailedCategory: 'LOAN_PAYMENTS_CAR_PAYMENT', amount: 400 })];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [], goals: ['pay down debt'] });
    expect(budget.debts.amount).toBe(0);
  });

  it('sums all liability types into debts.amount', () => {
    const liabilities: Liability[] = [
      makeCreditLiability(100),
      makeStudentLiability(200),
      makeMortgageLiability(1000),
    ];
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities, goals: ['pay down debt'] });
    expect(budget.debts.amount).toBe(1300);
  });

  it('accumulates totals across multiple transactions in the same category', () => {
    const txs = [
      makeTransaction({ plaidTransactionId: 'tx-1', detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 50 }),
      makeTransaction({ plaidTransactionId: 'tx-2', detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 75 }),
    ];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [], goals: ['pay down debt'] });
    expect(budget.groceries.amount).toBe(125);
  });

  it('skips transactions with null detailedCategory without throwing', () => {
    const txs = [
      makeTransaction({ detailedCategory: null, amount: 999 }),
      makeTransaction({ detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: 100 }),
    ];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [], goals: ['pay down debt'] });
    expect(budget.groceries.amount).toBe(100);
  });

  it('ignores expense transactions with negative amounts (credits/refunds)', () => {
    // Negative expense amounts represent refunds; after amount check (amount <= 0) they are skipped
    const txs = [makeTransaction({ detailedCategory: 'FOOD_AND_DRINK_GROCERIES', amount: -50 })];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [], goals: ['pay down debt'] });
    expect(budget.groceries.amount).toBe(0);
  });

  it('ignores income transactions with positive amounts (positive = debit in Plaid)', () => {
    // Plaid income is negative; a positive INCOME_SALARY would be wrong data — skipped
    const txs = [makeTransaction({ detailedCategory: 'INCOME_SALARY', amount: 100 })];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [], goals: ['pay down debt'] });
    expect(budget.income.amount).toBe(0);
  });

  it('computes investments from cash/transfer contribution investment transactions', () => {
    const invTxs = [
      makeInvestmentTransaction({ type: 'cash', subtype: 'contribution', amount: -500 }),
    ];
    const budget = generateBudgetFromHistory({
      userId,
      transactions: [],
      liabilities: [],
      investmentTransactions: invTxs,
      goals: ['pay down debt'],
    });
    expect(budget.investments.amount).toBe(500);
  });

  it('falls back to buy transactions for investments when no cash contributions exist', () => {
    const invTxs = [
      makeInvestmentTransaction({ type: 'buy', subtype: 'buy', amount: 750 }),
    ];
    const budget = generateBudgetFromHistory({
      userId,
      transactions: [],
      liabilities: [],
      investmentTransactions: invTxs,
      goals: ['pay down debt'],
    });
    expect(budget.investments.amount).toBe(750);
  });

  it('excludes dividend reinvestments from buy-based investment total', () => {
    const invTxs = [
      makeInvestmentTransaction({ type: 'buy', subtype: 'dividend reinvestment', amount: 200 }),
    ];
    const budget = generateBudgetFromHistory({
      userId,
      transactions: [],
      liabilities: [],
      investmentTransactions: invTxs,
      goals: ['pay down debt'],
    });
    expect(budget.investments.amount).toBe(0);
  });

  it('prefers cash contributions over buy transactions for investments', () => {
    const invTxs = [
      makeInvestmentTransaction({ type: 'cash', subtype: 'contribution', amount: -500 }),
      makeInvestmentTransaction({ type: 'buy', subtype: 'buy', amount: 750 }),
    ];
    const budget = generateBudgetFromHistory({
      userId,
      transactions: [],
      liabilities: [],
      investmentTransactions: invTxs,
      goals: ['pay down debt'],
    });
    // Cash contribution total (500) > 0, so buy total (750) is ignored
    expect(budget.investments.amount).toBe(500);
  });

  it('sets investments to 0 when no investmentTransactions are provided', () => {
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [], goals: ['pay down debt'] });
    expect(budget.investments.amount).toBe(0);
  });

  it('sets goals to the provided goals array', () => {
    const goals = ['pay down debt', 'maximize investments'] as const;
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [], goals: [...goals] });
    expect(budget.goals).toEqual(['pay down debt', 'maximize investments']);
  });

  // -------------------------------------------------------------------------
  // New categories: emergencyFund, entertainment, medical
  // -------------------------------------------------------------------------

  it('does NOT map TRANSFER_OUT_ACCOUNT_TRANSFER to any category — too generic', () => {
    const txs = [
      makeTransaction({ plaidTransactionId: 'tx-s1', detailedCategory: 'TRANSFER_OUT_ACCOUNT_TRANSFER', amount: 200 }),
    ];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [], goals: ['pay down debt'] });
    // Generic account transfers include credit card payments, inter-account moves, etc.
    // Too ambiguous for any single budget category.
    expect(budget.emergencyFund.amount).toBe(0);
  });

  it('computes emergencyFund from TRANSFER_OUT_SAVINGS transactions', () => {
    const txs = [
      makeTransaction({ plaidTransactionId: 'tx-s1', detailedCategory: 'TRANSFER_OUT_SAVINGS', amount: 200 }),
      makeTransaction({ plaidTransactionId: 'tx-s2', detailedCategory: 'TRANSFER_OUT_SAVINGS', amount: 200 }),
    ];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [], goals: ['pay down debt'] });
    expect(budget.emergencyFund.amount).toBe(400);
  });

  it('does NOT map TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS — investments come from investmentTransactions', () => {
    const txs = [
      makeTransaction({ plaidTransactionId: 'tx-inv1', detailedCategory: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS', amount: 291.67 }),
    ];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [], goals: ['pay down debt'] });
    expect(budget.investments.amount).toBe(0);
    expect(budget.emergencyFund.amount).toBe(0);
  });

  it('computes entertainment from ENTERTAINMENT_* transactions', () => {
    const txs = [
      makeTransaction({ plaidTransactionId: 'tx-e1', detailedCategory: 'ENTERTAINMENT_TV_AND_MOVIES', amount: 15.99 }),
      makeTransaction({ plaidTransactionId: 'tx-e2', detailedCategory: 'ENTERTAINMENT_MUSIC_AND_AUDIO', amount: 10.99 }),
    ];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [], goals: ['pay down debt'] });
    expect(budget.entertainment.amount).toBe(26.98);
  });

  it('computes medical from MEDICAL_* transactions', () => {
    const txs = [
      makeTransaction({ plaidTransactionId: 'tx-m1', detailedCategory: 'MEDICAL_PHARMACIES_AND_SUPPLEMENTS', amount: 47.36 }),
    ];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [], goals: ['pay down debt'] });
    expect(budget.medical.amount).toBe(47.36);
  });

  it('sets emergencyFund, entertainment, and medical to 0 when no matching transactions exist', () => {
    const budget = generateBudgetFromHistory({ userId, transactions: [], liabilities: [], goals: ['pay down debt'] });
    expect(budget.emergencyFund.amount).toBe(0);
    expect(budget.entertainment.amount).toBe(0);
    expect(budget.medical.amount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // INCOME_INTEREST_EARNED in income
  // -------------------------------------------------------------------------

  it('includes INCOME_INTEREST_EARNED in income total', () => {
    const txs = [
      makeTransaction({ plaidTransactionId: 'tx-i1', detailedCategory: 'INCOME_SALARY', amount: -3000 }),
      makeTransaction({ plaidTransactionId: 'tx-i2', detailedCategory: 'INCOME_INTEREST_EARNED', amount: -21.65 }),
    ];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [], goals: ['pay down debt'] });
    expect(budget.income.amount).toBe(3021.65);
  });

  it('includes INCOME_DIVIDENDS in income total', () => {
    const txs = [
      makeTransaction({ plaidTransactionId: 'tx-d1', detailedCategory: 'INCOME_DIVIDENDS', amount: -50 }),
    ];
    const budget = generateBudgetFromHistory({ userId, transactions: txs, liabilities: [], goals: ['pay down debt'] });
    expect(budget.income.amount).toBe(50);
  });
});
