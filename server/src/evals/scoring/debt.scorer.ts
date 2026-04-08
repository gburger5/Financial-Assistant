/**
 * @module scoring/debt.scorer
 * @description Scores DebtPaymentPlan outputs against a DebtEvalCase. Hard
 * constraints come from DEBT_SYSTEM_PROMPT:
 *
 *   - "Sum of payment amounts must equal debtAllocation exactly" (line 111)
 *   - "Assign the minimum payment to every debt first" (rule 1)
 *   - "Every dollar of debtAllocation must be assigned" (rule 5)
 *
 * Soft scores grade avalanche ordering (rank correlation between APR and
 * surplus assignment), payment_type label accuracy, projection math
 * accuracy, and summary format quality.
 *
 * Pure function — no I/O — so it is unit tested directly.
 */

import type { DebtPaymentPlan } from '../../modules/agents/core/tools.js';
import type { DebtAccount } from '../../modules/agents/agents.types.js';
import type {
  DebtEvalCase,
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
  rankCorrelation,
} from './shared.js';
import { SUM_EQUALITY_TOLERANCE } from '../eval.config.js';

/**
 * Sums all scheduled payment amounts in a plan.
 *
 * @param {DebtPaymentPlan} plan
 * @returns {number}
 */
function sumPayments(plan: DebtPaymentPlan): number {
  return plan.scheduled_payments.reduce((s, p) => s + p.amount, 0);
}

// ---------------------------------------------------------------------------
// Hard constraints
// ---------------------------------------------------------------------------

/**
 * Builds the full list of hard constraint results for a debt payment plan.
 *
 * @param {DebtPaymentPlan} output
 * @param {DebtEvalCase} testCase
 * @returns {HardConstraintResult[]}
 */
function checkHardConstraints(
  output: DebtPaymentPlan,
  testCase: DebtEvalCase,
): HardConstraintResult[] {
  const results: HardConstraintResult[] = [];
  const debts = testCase.input.debts;
  const allocation = testCase.input.debtAllocation;

  // Sum equals allocation
  const sum = sumPayments(output);
  results.push(
    hardConstraint(
      'payments_sum_equals_allocation',
      withinTolerance(sum, allocation, SUM_EQUALITY_TOLERANCE),
      `sum=${sum.toFixed(2)} allocation=${allocation.toFixed(2)}`,
    ),
  );

  // All debts covered
  const paidIds = new Set(output.scheduled_payments.map(p => p.plaid_account_id));
  const missing = debts.filter(d => !paidIds.has(d.account_id)).map(d => d.account_id);
  results.push(
    hardConstraint(
      'all_debts_covered',
      missing.length === 0,
      missing.length === 0 ? 'all debts paid' : `missing: ${missing.join(', ')}`,
    ),
  );

  // Minimums met (only enforced when allocation can cover all minimums)
  const totalMinimums = debts.reduce((s, d) => s + (d.minimum_payment ?? 0), 0);
  if (allocation + SUM_EQUALITY_TOLERANCE >= totalMinimums) {
    const violations: string[] = [];
    for (const d of debts) {
      const min = d.minimum_payment ?? 0;
      const paid = output.scheduled_payments
        .filter(p => p.plaid_account_id === d.account_id)
        .reduce((s, p) => s + p.amount, 0);
      if (paid + SUM_EQUALITY_TOLERANCE < min) {
        violations.push(`${d.name}: paid=${paid} min=${min}`);
      }
    }
    results.push(
      hardConstraint(
        'minimums_met',
        violations.length === 0,
        violations.length === 0 ? 'all minimums covered' : violations.join('; '),
      ),
    );
  } else {
    results.push(
      hardConstraint(
        'minimums_met',
        true,
        `underfunded: allocation=${allocation} < totalMinimums=${totalMinimums}`,
      ),
    );
  }

  // All amounts positive
  const nonpositive = output.scheduled_payments.filter(p => p.amount <= 0);
  results.push(
    hardConstraint(
      'all_amounts_positive',
      nonpositive.length === 0,
      nonpositive.length === 0 ? 'all amounts > 0' : `${nonpositive.length} non-positive`,
    ),
  );

  // Account IDs valid
  const knownIds = new Set(debts.map(d => d.account_id));
  const unknown = output.scheduled_payments
    .filter(p => !knownIds.has(p.plaid_account_id))
    .map(p => p.plaid_account_id);
  results.push(
    hardConstraint(
      'account_ids_valid',
      unknown.length === 0,
      unknown.length === 0 ? 'all ids valid' : `unknown: ${unknown.join(', ')}`,
    ),
  );

  // Projections exist for all debts
  const projectedIds = new Set(output.projections.map(p => p.plaid_account_id));
  const missingProj = debts.filter(d => !projectedIds.has(d.account_id)).map(d => d.account_id);
  results.push(
    hardConstraint(
      'projections_for_all_debts',
      missingProj.length === 0,
      missingProj.length === 0 ? 'all projected' : `missing: ${missingProj.join(', ')}`,
    ),
  );

  return results;
}

// ---------------------------------------------------------------------------
// Soft scores
// ---------------------------------------------------------------------------

/**
 * Computes the avalanche ordering score: rank correlation between debt APR
 * (descending) and surplus assigned (descending). 1.0 means the highest-APR
 * debt got the largest extra payment.
 *
 * @param {DebtPaymentPlan} plan
 * @param {DebtAccount[]} debts
 * @returns {SoftScoreResult}
 */
function avalancheOrderingScore(plan: DebtPaymentPlan, debts: DebtAccount[]): SoftScoreResult {
  if (debts.length < 2) {
    return pass('avalanche_ordering', 4, 'fewer than 2 debts');
  }
  const aprs: number[] = [];
  const surpluses: number[] = [];
  for (const d of debts) {
    aprs.push(d.interest_rate ?? 0);
    const paid = plan.scheduled_payments
      .filter(p => p.plaid_account_id === d.account_id)
      .reduce((s, p) => s + p.amount, 0);
    const surplus = paid - (d.minimum_payment ?? 0);
    surpluses.push(surplus);
  }
  const score = rankCorrelation(aprs, surpluses);
  return softScore('avalanche_ordering', score, 4, `rank correlation=${score.toFixed(2)}`);
}

/**
 * Scores payment_type label accuracy: each payment is labeled correctly when
 * - 'minimum' iff amount equals the debt's minimum
 * - 'extra' iff amount > minimum and < remaining balance
 * - 'payoff' iff amount >= remaining balance
 *
 * @param {DebtPaymentPlan} plan
 * @param {DebtAccount[]} debts
 * @returns {SoftScoreResult}
 */
function paymentTypeAccuracyScore(plan: DebtPaymentPlan, debts: DebtAccount[]): SoftScoreResult {
  const debtById = new Map(debts.map(d => [d.account_id, d]));
  let correct = 0;
  let total = 0;
  for (const p of plan.scheduled_payments) {
    const d = debtById.get(p.plaid_account_id);
    if (!d) continue;
    total++;
    const min = d.minimum_payment ?? 0;
    const balance = d.current_balance;
    let expected: 'minimum' | 'extra' | 'payoff';
    if (p.amount + SUM_EQUALITY_TOLERANCE >= balance) expected = 'payoff';
    else if (Math.abs(p.amount - min) <= SUM_EQUALITY_TOLERANCE) expected = 'minimum';
    else expected = 'extra';
    if (p.payment_type === expected) correct++;
  }
  if (total === 0) return fail('payment_type_accuracy', 2, 'no payments to score');
  const score = correct / total;
  return softScore('payment_type_accuracy', score, 2, `${correct}/${total} correct`);
}

/**
 * Scores whether interest_savings is positive when there is surplus above
 * minimums. When allocation == minimums there is no surplus, so any value
 * is acceptable (vacuously 1.0).
 *
 * @param {DebtPaymentPlan} plan
 * @param {DebtEvalCase} testCase
 * @returns {SoftScoreResult}
 */
function interestSavingsPlausibleScore(
  plan: DebtPaymentPlan,
  testCase: DebtEvalCase,
): SoftScoreResult {
  const totalMinimums = testCase.input.debts.reduce((s, d) => s + (d.minimum_payment ?? 0), 0);
  const surplus = testCase.input.debtAllocation - totalMinimums;
  if (surplus <= 0) {
    return pass('interest_savings_plausible', 1, 'no surplus over minimums');
  }
  if (plan.interest_savings > 0) {
    return pass('interest_savings_plausible', 1, `savings=${plan.interest_savings}`);
  }
  return fail('interest_savings_plausible', 1, `savings=${plan.interest_savings} despite surplus=${surplus}`);
}

/**
 * Scores summary format quality. Same rules as the budget summary scorer.
 *
 * @param {DebtPaymentPlan} plan
 * @returns {SoftScoreResult}
 */
function summaryQualityScore(plan: DebtPaymentPlan): SoftScoreResult {
  const text = plan.summary ?? '';
  const reasons: string[] = [];
  if (/^[\s]*[-•*]\s/m.test(text)) reasons.push('bullet markers');
  if (/^#+\s/m.test(text)) reasons.push('markdown header');
  if (/\b[A-Z]{4,}\b/.test(text)) reasons.push('ALL CAPS run');
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  if (sentences === 0 || sentences > 4) reasons.push(`sentences=${sentences}`);
  if (reasons.length === 0) return pass('summary_quality', 1, `clean, sentences=${sentences}`);
  return fail('summary_quality', 1, reasons.join('; '));
}

/**
 * Builds all soft scores for a debt payment plan.
 *
 * @param {DebtPaymentPlan} output
 * @param {DebtEvalCase} testCase
 * @returns {SoftScoreResult[]}
 */
function checkSoftScores(output: DebtPaymentPlan, testCase: DebtEvalCase): SoftScoreResult[] {
  return [
    avalancheOrderingScore(output, testCase.input.debts),
    paymentTypeAccuracyScore(output, testCase.input.debts),
    interestSavingsPlausibleScore(output, testCase),
    summaryQualityScore(output),
  ];
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Scores a single DebtPaymentPlan output against an eval case.
 *
 * @param {DebtPaymentPlan} output
 * @param {DebtEvalCase} testCase
 * @returns {SingleRunScore}
 */
export function scoreDebtOutput(
  output: DebtPaymentPlan,
  testCase: DebtEvalCase,
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
