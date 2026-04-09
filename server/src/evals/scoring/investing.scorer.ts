/**
 * @module scoring/investing.scorer
 * @description Scores InvestmentPlan outputs against an InvestingEvalCase.
 * Hard constraints come from INVESTING_SYSTEM_PROMPT:
 *
 *   - "Sum of contribution amounts must equal investingAllocation exactly" (line 190)
 *   - "Retirement age: 60" (projection rules)
 *   - "Average annual return: 7%" (projection rules)
 *   - "Years to retirement = 60 minus the user's current age"
 *
 * Soft scores grade the account-priority waterfall, three-fund bond ratio,
 * projection math accuracy, contribution_type label accuracy, and summary
 * format quality.
 *
 * Pure function — no I/O — so it is unit tested directly.
 */

import type { InvestmentPlan } from '../../modules/agents/core/tools.js';
import type { InvestmentAccount } from '../../modules/agents/agents.types.js';
import type {
  InvestingEvalCase,
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
  withinFraction,
  weightedMean,
} from './shared.js';
import {
  SUM_EQUALITY_TOLERANCE,
  PROJECTION_MATH_TOLERANCE,
} from '../eval.config.js';

/** Priority weights used by the account waterfall soft score. Higher = earlier. */
const ACCOUNT_PRIORITY: Record<InvestmentAccount['type'], number> = {
  '401k': 4,
  ira: 3,
  brokerage: 1,
  other: 0,
};

/**
 * Sums all scheduled contribution amounts in a plan.
 *
 * @param {InvestmentPlan} plan
 * @returns {number}
 */
function sumContributions(plan: InvestmentPlan): number {
  return plan.scheduled_contributions.reduce((s, c) => s + c.amount, 0);
}

// ---------------------------------------------------------------------------
// Hard constraints
// ---------------------------------------------------------------------------

/**
 * Builds the full list of hard constraint results for an investment plan.
 *
 * @param {InvestmentPlan} output
 * @param {InvestingEvalCase} testCase
 * @returns {HardConstraintResult[]}
 */
function checkHardConstraints(
  output: InvestmentPlan,
  testCase: InvestingEvalCase,
): HardConstraintResult[] {
  const results: HardConstraintResult[] = [];
  const accounts = testCase.input.accounts;
  const allocation = testCase.input.investingAllocation;

  // Sum equals allocation
  const sum = sumContributions(output);
  results.push(
    hardConstraint(
      'contributions_sum_equals_allocation',
      withinTolerance(sum, allocation, SUM_EQUALITY_TOLERANCE),
      `sum=${sum.toFixed(2)} allocation=${allocation.toFixed(2)}`,
    ),
  );

  // All amounts positive
  const nonpositive = output.scheduled_contributions.filter(c => c.amount <= 0);
  results.push(
    hardConstraint(
      'all_amounts_positive',
      nonpositive.length === 0,
      nonpositive.length === 0 ? 'all amounts > 0' : `${nonpositive.length} non-positive`,
    ),
  );

  // Account ids valid
  const knownIds = new Set(accounts.map(a => a.account_id));
  const unknown = output.scheduled_contributions
    .filter(c => !knownIds.has(c.plaid_account_id))
    .map(c => c.plaid_account_id);
  results.push(
    hardConstraint(
      'account_ids_valid',
      unknown.length === 0,
      unknown.length === 0 ? 'all ids valid' : `unknown: ${unknown.join(', ')}`,
    ),
  );

  // Retirement age
  results.push(
    hardConstraint(
      'retirement_age_is_60',
      output.projections.retirement_age === 60,
      `retirement_age=${output.projections.retirement_age}`,
    ),
  );

  // Annual return
  results.push(
    hardConstraint(
      'assumed_return_is_seven_percent',
      withinTolerance(output.projections.assumed_annual_return, 0.07, 0.001),
      `assumed_annual_return=${output.projections.assumed_annual_return}`,
    ),
  );

  // Years to retirement
  if (testCase.input.userAge === null) {
    results.push(
      hardConstraint(
        'years_to_retirement_correct',
        true,
        'age is null — cannot validate',
      ),
    );
  } else {
    const expected = 60 - testCase.input.userAge;
    const actual = output.projections.years_to_retirement;
    results.push(
      hardConstraint(
        'years_to_retirement_correct',
        Math.abs(actual - expected) <= 1,
        `actual=${actual} expected=${expected}`,
      ),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Soft scores
// ---------------------------------------------------------------------------

/**
 * Scores account priority waterfall: rewards plans where higher-priority
 * accounts (401k, IRA) receive larger shares of the total than lower-priority
 * accounts (brokerage). Computed as the fraction of the allocation that
 * lands in priority-weighted accounts vs an "ideal" priority-weighted target.
 *
 * @param {InvestmentPlan} plan
 * @param {InvestmentAccount[]} accounts
 * @returns {SoftScoreResult}
 */
function accountPriorityScore(plan: InvestmentPlan, accounts: InvestmentAccount[]): SoftScoreResult {
  const accById = new Map(accounts.map(a => [a.account_id, a]));
  const total = sumContributions(plan);
  if (total <= 0) return fail('account_priority_order', 4, 'total contributions is zero');
  let weighted = 0;
  let maxWeighted = 0;
  for (const c of plan.scheduled_contributions) {
    const acc = accById.get(c.plaid_account_id);
    if (!acc) continue;
    const w = ACCOUNT_PRIORITY[acc.type] ?? 0;
    weighted += c.amount * w;
    maxWeighted = Math.max(maxWeighted, w);
  }
  const idealWeighted = total * maxWeighted;
  if (idealWeighted === 0) return fail('account_priority_order', 4, 'no priority signal');
  const score = weighted / idealWeighted;
  return softScore(
    'account_priority_order',
    score,
    4,
    `weighted=${weighted.toFixed(0)} ideal=${idealWeighted.toFixed(0)}`,
  );
}

/**
 * Scores adherence to the three-fund bond ratio rule:
 *   bondPct = max(0, age - 30) * 1%
 *
 * Bond holdings are detected by ticker keywords ('BND', 'AGG', 'BOND'). Score
 * is 1.0 when the actual bond ratio is within 5 percentage points of target.
 *
 * @param {InvestmentPlan} plan
 * @param {InvestingEvalCase} testCase
 * @returns {SoftScoreResult}
 */
function threeFundBondRatioScore(
  plan: InvestmentPlan,
  testCase: InvestingEvalCase,
): SoftScoreResult {
  const age = testCase.input.userAge ?? 30;
  const targetBondPct = Math.max(0, age - 30) / 100;
  const total = sumContributions(plan);
  if (total <= 0) return fail('three_fund_bond_ratio', 3, 'no contributions');
  let bondAmount = 0;
  for (const c of plan.scheduled_contributions) {
    const ticker = (c.fund_ticker ?? '').toUpperCase();
    const name = (c.fund_name ?? '').toUpperCase();
    if (/BND|AGG|BOND/.test(ticker) || /BOND/.test(name)) {
      bondAmount += c.amount;
    }
  }
  const actualBondPct = bondAmount / total;
  const deviation = Math.abs(actualBondPct - targetBondPct);
  // 0.05 = full credit, 0.30 = zero credit. Linear in between.
  const score = Math.max(0, 1 - Math.max(0, deviation - 0.05) / 0.25);
  return softScore(
    'three_fund_bond_ratio',
    score,
    3,
    `actual=${(actualBondPct * 100).toFixed(0)}% target=${(targetBondPct * 100).toFixed(0)}%`,
  );
}

/**
 * Scores projection math consistency:
 *   - total_projected_contributions ≈ allocation * 12 * years_to_retirement
 *   - total_at_retirement ≈ contributions + growth
 *
 * Both checks use a 10% fractional tolerance. Score is 1.0 if both pass,
 * 0.5 if one passes, 0.0 if neither.
 *
 * @param {InvestmentPlan} plan
 * @param {InvestingEvalCase} testCase
 * @returns {SoftScoreResult}
 */
function projectionMathScore(
  plan: InvestmentPlan,
  testCase: InvestingEvalCase,
): SoftScoreResult {
  const proj = plan.projections;
  const expectedContribs = testCase.input.investingAllocation * 12 * proj.years_to_retirement;
  const contribsOk = withinFraction(proj.total_projected_contributions, expectedContribs, PROJECTION_MATH_TOLERANCE);
  const totalOk = withinFraction(
    proj.total_at_retirement,
    proj.total_projected_contributions + proj.total_projected_growth,
    PROJECTION_MATH_TOLERANCE,
  );
  const passed = (contribsOk ? 1 : 0) + (totalOk ? 1 : 0);
  return softScore(
    'projection_math_accuracy',
    passed / 2,
    2,
    `contribsOk=${contribsOk} totalOk=${totalOk}`,
  );
}

/**
 * Scores contribution_type label accuracy: each contribution's
 * contribution_type field should match the underlying account's type.
 *
 * @param {InvestmentPlan} plan
 * @param {InvestmentAccount[]} accounts
 * @returns {SoftScoreResult}
 */
function contributionTypeAccuracyScore(
  plan: InvestmentPlan,
  accounts: InvestmentAccount[],
): SoftScoreResult {
  const accById = new Map(accounts.map(a => [a.account_id, a]));
  let correct = 0;
  let total = 0;
  for (const c of plan.scheduled_contributions) {
    const acc = accById.get(c.plaid_account_id);
    if (!acc) continue;
    total++;
    const expectedRoot = acc.type;
    // Map account type -> acceptable contribution_type values.
    const ok =
      (expectedRoot === '401k' && c.contribution_type === '401k') ||
      (expectedRoot === 'ira' && (c.contribution_type === 'roth_ira' || c.contribution_type === 'traditional_ira')) ||
      (expectedRoot === 'brokerage' && c.contribution_type === 'brokerage');
    if (ok) correct++;
  }
  if (total === 0) return fail('contribution_type_accuracy', 1, 'no contributions');
  return softScore('contribution_type_accuracy', correct / total, 1, `${correct}/${total}`);
}

/**
 * Scores summary format quality. Same rules as the budget summary scorer.
 *
 * @param {InvestmentPlan} plan
 * @returns {SoftScoreResult}
 */
function summaryQualityScore(plan: InvestmentPlan): SoftScoreResult {
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
 * Builds all soft scores for an investment plan.
 *
 * @param {InvestmentPlan} output
 * @param {InvestingEvalCase} testCase
 * @returns {SoftScoreResult[]}
 */
function checkSoftScores(
  output: InvestmentPlan,
  testCase: InvestingEvalCase,
): SoftScoreResult[] {
  return [
    accountPriorityScore(output, testCase.input.accounts),
    threeFundBondRatioScore(output, testCase),
    projectionMathScore(output, testCase),
    contributionTypeAccuracyScore(output, testCase.input.accounts),
    summaryQualityScore(output),
  ];
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Scores a single InvestmentPlan output against an eval case.
 *
 * @param {InvestmentPlan} output
 * @param {InvestingEvalCase} testCase
 * @returns {SingleRunScore}
 */
export function scoreInvestingOutput(
  output: InvestmentPlan,
  testCase: InvestingEvalCase,
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
