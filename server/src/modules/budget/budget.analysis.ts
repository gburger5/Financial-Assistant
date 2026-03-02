/**
 * @module budget.analysis
 * @description Pure analysis functions for generating budget snapshots from
 * transaction and liability history. No I/O, no database calls — importable
 * by tests without side effects.
 *
 * Design decisions:
 * - computeMonthsOfData derives the date range from actual transaction dates
 *   rather than a fixed window, so users with years of history are correctly
 *   represented rather than being truncated to 30 days.
 * - computeAverageMonthly uses a Set for O(1) category lookup per transaction.
 *   Called up to 9 times per budget generation across potentially thousands
 *   of transactions; Array.includes would be O(n) per lookup.
 * - Income uses flipSign: true because Plaid's convention is positive = money
 *   out, negative = money in. A $3,000 paycheck arrives as -3000.
 * - computeTotalMinimumPayments reads from liabilities, not transactions.
 *   Minimum payment amounts are current contractual obligations — averaging
 *   them over time would be wrong if loans were paid off mid-period.
 * - detailedCategory (not category) is matched. CATEGORY_MAP uses Plaid's
 *   detailed strings like FOOD_AND_DRINK_GROCERIES, which distinguishes
 *   groceries from restaurants from coffee shops.
 */
import { ulid } from 'ulid';
import type { Transaction } from '../transactions/transactions.types.js';
import type { Liability } from '../liabilities/liabilities.types.js';
import { CATEGORY_MAP, type Budget } from './budget.types.js';

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
 * Derives the number of months covered by a transaction set.
 * Uses the distance between the earliest and latest transaction dates
 * rather than a fixed calendar window, so users with years of data
 * get a properly averaged figure rather than one inflated by a short window.
 * Returns a minimum of 1 to prevent division by zero on empty or single-item sets.
 *
 * @param {Transaction[]} transactions
 * @returns {number} Months of data, minimum 1.
 */
export function computeMonthsOfData(transactions: Transaction[]): number {
  if (transactions.length === 0) return 1;

  let earliest = transactions[0].date;
  let latest = transactions[0].date;

  for (const tx of transactions) {
    if (tx.date < earliest) earliest = tx.date;
    if (tx.date > latest) latest = tx.date;
  }

  const start = new Date(earliest);
  const end = new Date(latest);

  // Fractional months between start and end dates
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    (end.getDate() - start.getDate()) / 30;

  return Math.max(1, months);
}

/**
 * Computes the average monthly spend for a set of Plaid detailed categories.
 * Uses a Set for O(1) per-transaction category lookup across potentially thousands
 * of transactions (called up to 9 times per budget generation).
 *
 * @param {Transaction[]} transactions - All user transactions.
 * @param {readonly string[]} categories - Plaid detailedCategory strings to sum.
 * @param {boolean} flipSign - When true, negates amounts before summing.
 *   Use for income: Plaid represents income as negative (money in = -3000).
 * @returns {number} Average monthly total, rounded to 2 decimal places.
 */
export function computeAverageMonthly(
  transactions: Transaction[],
  categories: readonly string[],
  flipSign: boolean,
): number {
  if (transactions.length === 0) return 0;

  const categorySet = new Set(categories);
  const months = computeMonthsOfData(transactions);

  let total = 0;
  for (const tx of transactions) {
    if (tx.detailedCategory === null) continue;
    if (!categorySet.has(tx.detailedCategory)) continue;
    total += flipSign ? -tx.amount : tx.amount;
  }

  return round(total / months);
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
 * Generates a new Budget snapshot from a user's full transaction and
 * liability history. Returns a complete Budget record ready to be saved.
 *
 * Each spending category uses computeAverageMonthly with the corresponding
 * Plaid detailedCategory strings from CATEGORY_MAP. Debts are sourced from
 * liabilities (not transactions) via computeTotalMinimumPayments.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {Transaction[]} params.transactions
 * @param {Liability[]} params.liabilities
 * @returns {Budget}
 */
export function generateBudgetFromHistory({
  userId,
  transactions,
  liabilities,
}: {
  userId: string;
  transactions: Transaction[];
  liabilities: Liability[];
}): Budget {
  // TRACE-LOG: temporary instrumentation for onboarding audit — remove after run
  const months = computeMonthsOfData(transactions);
  console.log(`[TRACE] generateBudgetFromHistory: ${transactions.length} txs, months=${months.toFixed(2)}`);

  const income         = computeAverageMonthly(transactions, CATEGORY_MAP.income, true);
  const housing        = computeAverageMonthly(transactions, CATEGORY_MAP.housing, false);
  const utilities      = computeAverageMonthly(transactions, CATEGORY_MAP.utilities, false);
  const transportation = computeAverageMonthly(transactions, CATEGORY_MAP.transportation, false);
  const groceries      = computeAverageMonthly(transactions, CATEGORY_MAP.groceries, false);
  const takeout        = computeAverageMonthly(transactions, CATEGORY_MAP.takeout, false);
  const shopping       = computeAverageMonthly(transactions, CATEGORY_MAP.shopping, false);
  const personalCare   = computeAverageMonthly(transactions, CATEGORY_MAP.personalCare, false);
  const debts          = computeTotalMinimumPayments(liabilities);
  const investments    = computeAverageMonthly(transactions, CATEGORY_MAP.investments, false);

  console.log('[TRACE] generateBudgetFromHistory amounts:', JSON.stringify({
    months: +months.toFixed(2),
    income, housing, utilities, transportation,
    groceries, takeout, shopping, personalCare, debts, investments,
  }, null, 2));

  return {
    userId,
    budgetId: ulid(),
    createdAt: new Date().toISOString(),
    income:         { amount: income },
    housing:        { amount: housing },
    utilities:      { amount: utilities },
    transportation: { amount: transportation },
    groceries:      { amount: groceries },
    takeout:        { amount: takeout },
    shopping:       { amount: shopping },
    personalCare:   { amount: personalCare },
    debts:          { amount: debts },
    investments:    { amount: investments },
  };
}
