/**
 * @module scoring/budget.scorer
 * @description Scores BudgetProposal outputs against a BudgetEvalCase. Hard
 * constraints are derived directly from the BUDGET_SYSTEM_PROMPT rules:
 *
 *   - "The sum of all numeric category fields must equal income exactly" (rule 5)
 *   - "Always allocate a nonzero amount to investments" (rule 1)
 *   - "Allocate at least the sum of all minimum payments to debts" (rule 2)
 *   - "Never reduce a need category below the user's current actual spending" (rule 3)
 *
 * Soft scores graded the quality of the decision: how close to 50/30/20, how
 * well the emergency-fund tier rules were followed, and whether high-APR debt
 * was prioritised over investments.
 *
 * Pure function — no I/O — so it is unit tested directly.
 */

import type { BudgetProposal } from '../../modules/agents/core/tools.js';
import type {
  BudgetEvalCase,
  HardConstraintResult,
  SingleRunScore,
  SoftScoreResult,
} from '../eval.types.js';
import {
  hardConstraint,
  softScore,
  pass,
  fail,
  withinTolerance,
  weightedMean,
} from './shared.js';
import {
  SUM_EQUALITY_TOLERANCE,
  NEEDS_REDUCTION_TOLERANCE,
  HIGH_APR_THRESHOLD,
} from '../eval.config.js';
import type { Liability } from '../../modules/liabilities/liabilities.types.js';

const NEED_FIELDS = ['housing', 'utilities', 'transportation', 'groceries', 'medical'] as const;
const NEED_AND_EF_FIELDS = [...NEED_FIELDS, 'emergencyFund'] as const;
const WANT_FIELDS = ['takeout', 'shopping', 'personalCare', 'entertainment'] as const;
const ALL_CATEGORY_FIELDS = [
  'housing', 'utilities', 'transportation', 'groceries',
  'takeout', 'shopping', 'personalCare', 'emergencyFund',
  'entertainment', 'medical', 'debts', 'investments',
] as const;

/**
 * Sums all non-income category fields of a BudgetProposal.
 *
 * @param {BudgetProposal} p
 * @returns {number}
 */
function sumCategories(p: BudgetProposal): number {
  return ALL_CATEGORY_FIELDS.reduce((s, k) => s + p[k], 0);
}

/**
 * Extracts the minimum payment from any liability type. Falls back to 0 for
 * mortgages without nextMonthlyPayment or liabilities with null minimums.
 *
 * @param {Liability} l
 * @returns {number}
 */
function minimumPayment(l: Liability): number {
  if (l.liabilityType === 'credit') return l.details.minimumPaymentAmount ?? 0;
  if (l.liabilityType === 'student') return l.details.minimumPaymentAmount ?? 0;
  return l.details.nextMonthlyPayment ?? 0;
}

/**
 * Returns the highest APR (as a decimal, e.g. 0.24) across all liabilities
 * of any type. Used to detect "high APR debt exists" for soft scoring.
 *
 * @param {Liability[]} liabilities
 * @returns {number}
 */
function maxApr(liabilities: Liability[]): number {
  let max = 0;
  for (const l of liabilities) {
    if (l.liabilityType === 'credit') {
      for (const a of l.details.aprs) {
        const decimal = a.aprPercentage / 100;
        if (decimal > max) max = decimal;
      }
    } else if (l.liabilityType === 'student') {
      const r = (l.details.interestRatePercentage ?? 0) / 100;
      if (r > max) max = r;
    } else {
      const r = (l.details.interestRatePercentage ?? 0) / 100;
      if (r > max) max = r;
    }
  }
  return max;
}

/**
 * Computes the user's total liquid savings balance from depository accounts.
 * Used by the emergency-fund tier rule.
 *
 * @param {BudgetEvalCase} testCase
 * @returns {number}
 */
function liquidSavings(testCase: BudgetEvalCase): number {
  return testCase.mockData.accounts
    .filter(a => a.type === 'depository')
    .reduce((s, a) => s + (a.currentBalance ?? 0), 0);
}

/**
 * Determines the emergency fund cap (as a fraction of income) per the
 * tiered rules in BUDGET_SYSTEM_PROMPT lines 72-83.
 *
 * @param {number} savings - Total liquid savings.
 * @param {number} income - Monthly income.
 * @returns {number} Cap as a fraction of income (0.30, 0.10, or 0.05).
 */
function emergencyFundCap(savings: number, income: number): number {
  if (savings < income * 3) return 0.30;
  if (savings < income * 6) return 0.10;
  return 0.05;
}

// ---------------------------------------------------------------------------
// Hard constraints
// ---------------------------------------------------------------------------

/**
 * Builds the full list of hard constraint results for a budget proposal.
 *
 * @param {BudgetProposal} output
 * @param {BudgetEvalCase} testCase
 * @returns {HardConstraintResult[]}
 */
function checkHardConstraints(
  output: BudgetProposal,
  testCase: BudgetEvalCase,
): HardConstraintResult[] {
  const results: HardConstraintResult[] = [];
  const inputBudget = testCase.input.budget;

  // Sum equals income
  const sum = sumCategories(output);
  results.push(
    hardConstraint(
      'categories_sum_equals_income',
      withinTolerance(sum, output.income, SUM_EQUALITY_TOLERANCE),
      `sum=${sum.toFixed(2)} income=${output.income.toFixed(2)}`,
    ),
  );

  // Investments nonzero
  results.push(
    hardConstraint(
      'investments_nonzero',
      output.investments > 0,
      `investments=${output.investments}`,
    ),
  );

  // Debts >= sum of minimums
  const totalMinimums = testCase.mockData.liabilities.reduce(
    (s, l) => s + minimumPayment(l),
    0,
  );
  results.push(
    hardConstraint(
      'debts_gte_min_payments',
      output.debts + SUM_EQUALITY_TOLERANCE >= totalMinimums,
      `debts=${output.debts} totalMinimums=${totalMinimums}`,
    ),
  );

  // All categories nonnegative
  const negativeFields = ALL_CATEGORY_FIELDS.filter(k => output[k] < 0);
  results.push(
    hardConstraint(
      'all_categories_nonnegative',
      negativeFields.length === 0,
      negativeFields.length === 0
        ? 'all fields >= 0'
        : `negative fields: ${negativeFields.join(', ')}`,
    ),
  );

  // Income matches input
  results.push(
    hardConstraint(
      'income_matches_input',
      withinTolerance(output.income, inputBudget.income.amount, SUM_EQUALITY_TOLERANCE),
      `output=${output.income} input=${inputBudget.income.amount}`,
    ),
  );

  // Needs not reduced below actual (within 5% tolerance)
  const violations: string[] = [];
  for (const field of NEED_FIELDS) {
    const actual = inputBudget[field].amount;
    const proposed = output[field];
    const minAllowed = actual * (1 - NEEDS_REDUCTION_TOLERANCE);
    if (proposed < minAllowed) {
      violations.push(`${field}: proposed=${proposed} actual=${actual}`);
    }
  }
  results.push(
    hardConstraint(
      'needs_not_reduced_below_actual',
      violations.length === 0,
      violations.length === 0 ? 'all needs preserved' : violations.join('; '),
    ),
  );

  return results;
}

// ---------------------------------------------------------------------------
// Soft scores
// ---------------------------------------------------------------------------

/**
 * Computes the 50/30/20 adherence score. The score is 1.0 when the actual
 * Needs/Wants/Savings split exactly matches 50/30/20, decreasing linearly
 * with distance. The maximum L1 distance from the target is bounded by 2.0
 * (one category at 100%, others at 0).
 *
 * @param {BudgetProposal} p
 * @returns {SoftScoreResult}
 */
function fiftyThirtyTwentyScore(p: BudgetProposal): SoftScoreResult {
  const income = p.income;
  if (income <= 0) return fail('fifty_thirty_twenty_adherence', 3, 'income is zero');
  const needs = NEED_AND_EF_FIELDS.reduce((s, k) => s + p[k], 0);
  const wants = WANT_FIELDS.reduce((s, k) => s + p[k], 0);
  const savings = p.debts + p.investments;
  const total = needs + wants + savings;
  if (total <= 0) return fail('fifty_thirty_twenty_adherence', 3, 'total is zero');
  const dn = Math.abs(needs / total - 0.5);
  const dw = Math.abs(wants / total - 0.3);
  const ds = Math.abs(savings / total - 0.2);
  const distance = dn + dw + ds; // L1 distance, max ~2.0
  const score = Math.max(0, 1 - distance / 1.0);
  return softScore(
    'fifty_thirty_twenty_adherence',
    score,
    3,
    `needs=${(needs / total).toFixed(2)} wants=${(wants / total).toFixed(2)} savings=${(savings / total).toFixed(2)}`,
  );
}

/**
 * Scores adherence to the emergency-fund tier rules. Binary at the cap:
 * within cap = 1.0, over = 0.
 *
 * @param {BudgetProposal} p
 * @param {BudgetEvalCase} testCase
 * @returns {SoftScoreResult}
 */
function emergencyFundTierScore(
  p: BudgetProposal,
  testCase: BudgetEvalCase,
): SoftScoreResult {
  const savings = liquidSavings(testCase);
  const cap = emergencyFundCap(savings, p.income);
  const capDollars = cap * p.income;
  const within = p.emergencyFund <= capDollars + SUM_EQUALITY_TOLERANCE;
  return softScore(
    'emergency_fund_tier_compliance',
    within ? 1.0 : 0.0,
    2,
    `ef=${p.emergencyFund} cap=${capDollars.toFixed(0)} (savings=${savings})`,
  );
}

/**
 * Scores whether high-APR debt was prioritised over investments. Vacuously
 * 1.0 if no high-APR debt exists. 1.0 if debts > investments. 0.5 if equal.
 * 0 if investments > debts despite high-APR debt.
 *
 * @param {BudgetProposal} p
 * @param {BudgetEvalCase} testCase
 * @returns {SoftScoreResult}
 */
function debtPrioritizationScore(
  p: BudgetProposal,
  testCase: BudgetEvalCase,
): SoftScoreResult {
  const max = maxApr(testCase.mockData.liabilities);
  if (max < HIGH_APR_THRESHOLD) {
    return pass('debt_prioritized_when_high_apr', 2, `no debt above ${HIGH_APR_THRESHOLD * 100}% APR`);
  }
  if (p.debts > p.investments) {
    return pass('debt_prioritized_when_high_apr', 2, `debts=${p.debts} > investments=${p.investments}`);
  }
  if (p.debts === p.investments) {
    return softScore('debt_prioritized_when_high_apr', 0.5, 2, 'debts equal investments');
  }
  return fail(
    'debt_prioritized_when_high_apr',
    2,
    `debts=${p.debts} < investments=${p.investments} despite ${(max * 100).toFixed(1)}% APR`,
  );
}

/**
 * Scores summary format quality. The system prompt forbids headers, bullet
 * points, dashes, and ALL CAPS sections. Detected via regex.
 *
 * @param {BudgetProposal} p
 * @returns {SoftScoreResult}
 */
function summaryQualityScore(p: BudgetProposal): SoftScoreResult {
  const text = p.summary ?? '';
  const reasons: string[] = [];

  // Bullets / list dashes at the start of a line.
  if (/^[\s]*[-•*]\s/m.test(text)) reasons.push('contains bullet/list markers');
  // Markdown headers
  if (/^#+\s/m.test(text)) reasons.push('contains markdown header');
  // ALL CAPS sequence of 3+ words
  if (/\b[A-Z]{4,}\b/.test(text)) reasons.push('contains ALL CAPS run');
  // Sentence count: 1-4 acceptable
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  if (sentences === 0 || sentences > 4) reasons.push(`sentence count=${sentences}`);

  if (reasons.length === 0) {
    return pass('summary_quality', 1, `clean summary, sentences=${sentences}`);
  }
  return fail('summary_quality', 1, reasons.join('; '));
}

/**
 * Builds the full list of soft scores for a budget proposal.
 *
 * @param {BudgetProposal} output
 * @param {BudgetEvalCase} testCase
 * @returns {SoftScoreResult[]}
 */
function checkSoftScores(
  output: BudgetProposal,
  testCase: BudgetEvalCase,
): SoftScoreResult[] {
  return [
    fiftyThirtyTwentyScore(output),
    emergencyFundTierScore(output, testCase),
    debtPrioritizationScore(output, testCase),
    summaryQualityScore(output),
  ];
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Scores a single BudgetProposal output against an eval case. Returns a
 * SingleRunScore that the runner aggregates across N runs.
 *
 * @param {BudgetProposal} output - The agent's structured output.
 * @param {BudgetEvalCase} testCase - The case definition with input and mock data.
 * @returns {SingleRunScore}
 */
export function scoreBudgetOutput(
  output: BudgetProposal,
  testCase: BudgetEvalCase,
): SingleRunScore {
  const hardConstraints = checkHardConstraints(output, testCase);
  const softScores = checkSoftScores(output, testCase);
  return {
    hardConstraints,
    softScores,
    allHardConstraintsPassed: hardConstraints.every(c => c.passed),
    weightedSoftScore: weightedMean(softScores),
    rawOutput: output,
    durationMs: 0,
  };
}
