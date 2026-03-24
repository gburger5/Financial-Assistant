/**
 * @module budget.analysis
 * @description Pure analysis functions for generating budget snapshots from
 * transaction and liability history. No I/O, no database calls — importable
 * by tests without side effects.
 *
 * Design decisions:
 * - Single-pass accumulation: transactions are iterated once, and each
 *   transaction's detailedCategory is looked up in the inverted CATEGORY_MAP
 *   to determine which budget field(s) it maps to.
 * - Income uses sign-flip because Plaid's convention is positive = money
 *   out, negative = money in. A $3,000 paycheck arrives as -3000.
 * - computeTotalMinimumPayments reads from liabilities, not transactions.
 *   Minimum payment amounts are current contractual obligations — averaging
 *   them over time would be wrong if loans were paid off mid-period.
 * - Debt-related transaction categories (LOAN_PAYMENTS_*) are absent from
 *   CATEGORY_MAP so they never contaminate spending categories. Debts come
 *   exclusively from liabilities.
 */
import { ulid } from 'ulid';
import type { Transaction } from '../transactions/transactions.types.js';
import type { Liability } from '../liabilities/liabilities.types.js';
import type { InvestmentTransaction } from '../investments/investments.types.js';
import { CATEGORY_MAP, INCOME_CATEGORIES, type Budget } from './budget.types.js';

/**
 * Rounds a number to 2 decimal places.
 * Applied throughout to prevent floating-point accumulation errors.
 *
 * @param {number} n
 * @returns {number}
 */
export function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Sums the current minimum payment obligations across all liability types.
 * Reads from liabilities rather than transactions because minimum payments are
 * contractual obligations at the current time — averaging historical payments
 * over months would be wrong if loans were paid off or refinanced.
 *
 * - Credit cards: details.minimumPaymentAmount
 * - Student loans: details.minimumPaymentAmount
 * - Mortgages: details.nextMonthlyPayment
 *
 * Null fields are treated as 0.
 *
 * @param {Liability[]} liabilities
 * @returns {number} Total minimum monthly debt payments.
 */
export function computeTotalMinimumPayments(liabilities: Liability[]): number {
  let total = 0;
  for (const liability of liabilities) {
    if (liability.liabilityType === 'credit') {
      total += liability.details.minimumPaymentAmount ?? 0;
    } else if (liability.liabilityType === 'student') {
      total += liability.details.minimumPaymentAmount ?? 0;
    } else if (liability.liabilityType === 'mortgage') {
      total += liability.details.nextMonthlyPayment ?? 0;
    }
  }
  return total;
}

/**
 * Sets a value on a nested object using a dot-separated path.
 * e.g. setNestedValue(budget, 'groceries.amount', 120) sets budget.groceries.amount = 120.
 *
 * @param {Record<string, unknown>} obj - The object to mutate.
 * @param {string} path - Dot-separated path (e.g. 'groceries.amount').
 * @param {number} value - The value to set.
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: number): void {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

/**
 * Generates a new Budget snapshot from a user's full transaction and
 * liability history. Returns a complete Budget record ready to be saved.
 *
 * Single-pass over transactions: each transaction's detailedCategory is
 * looked up in CATEGORY_MAP to find the budget field path(s) it maps to.
 * Amounts are accumulated per field, then applied to the budget object.
 *
 * Debts come exclusively from liabilities via computeTotalMinimumPayments.
 * Investments come from investmentTransactions when available.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {Transaction[]} params.transactions
 * @param {Liability[]} params.liabilities
 * @param {InvestmentTransaction[]} [params.investmentTransactions] - When provided,
 *   investment contribution is computed from actual investment activity.
 * @returns {Budget}
 */
export function generateBudgetFromHistory({
  userId,
  transactions,
  liabilities,
  investmentTransactions,
}: {
  userId: string;
  transactions: Transaction[];
  liabilities: Liability[];
  investmentTransactions?: InvestmentTransaction[];
}): Budget {
  const budget: Budget = {
    userId,
    budgetId: ulid(),
    createdAt: new Date().toISOString(),
    income:         { amount: 0 },
    housing:        { amount: 0 },
    utilities:      { amount: 0 },
    transportation: { amount: 0 },
    groceries:      { amount: 0 },
    takeout:        { amount: 0 },
    shopping:       { amount: 0 },
    personalCare:   { amount: 0 },
    emergencyFund:  { amount: 0 },
    entertainment:  { amount: 0 },
    medical:        { amount: 0 },
    debts:          { amount: 0 },
    investments:    { amount: 0 },
    goals:          [],
  };

  // Single pass: accumulate totals by budget field path
  const totals: Record<string, number> = {};

  for (const tx of transactions) {
    const detailed = tx.detailedCategory;
    if (!detailed) continue;

    const fields = CATEGORY_MAP[detailed];
    if (!fields) continue;

    // Plaid: positive = debit (expense), negative = credit (income)
    const amount = INCOME_CATEGORIES.has(detailed) ? -tx.amount : tx.amount;
    if (amount <= 0) continue;

    for (const field of fields) {
      totals[field] = (totals[field] ?? 0) + amount;
    }
  }

  // Apply totals to budget object
  for (const [path, total] of Object.entries(totals)) {
    setNestedValue(budget as unknown as Record<string, unknown>, path, round(total));
  }

  // Investment contributions from investment transactions
  if (investmentTransactions && investmentTransactions.length > 0) {
    // Sum cash/transfer contributions with negative amounts (cash inflows)
    const cashContributionTotal = investmentTransactions
      .filter(
        (tx) =>
          (tx.type === 'cash' || tx.type === 'transfer') &&
          (tx.subtype === 'contribution' || tx.subtype === 'deposit'),
      )
      .filter((tx) => tx.amount < 0)
      .reduce((sum, tx) => sum + -tx.amount, 0);

    // Fall back to buy transactions (excluding dividend reinvestments)
    const buyTotal = investmentTransactions
      .filter((tx) => tx.type === 'buy' && tx.subtype !== 'dividend reinvestment')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const contributionTotal = cashContributionTotal > 0 ? cashContributionTotal : buyTotal;

    if (contributionTotal > 0) {
      budget.investments.amount = round(contributionTotal);
    }
  }

  // Debts from liability minimum payments only
  const debtTotal = computeTotalMinimumPayments(liabilities);
  if (debtTotal > 0) {
    budget.debts.amount = round(debtTotal);
  }

  return budget;
}
