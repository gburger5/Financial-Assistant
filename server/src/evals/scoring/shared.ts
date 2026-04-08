/**
 * @module scoring/shared
 * @description Shared utilities used by every agent scorer: constraint and
 * score builders, tolerance helpers, amortization math (for debt projection
 * accuracy checks), rank correlation (for avalanche-ordering soft scores),
 * and statistical aggregation across N runs of the same eval case.
 *
 * All functions are pure — no I/O, no globals — so they are unit-tested
 * directly without any mocking infrastructure.
 */

import type {
  HardConstraintResult,
  SoftScoreResult,
  SoftScoreStats,
} from '../eval.types.js';

/**
 * Builds a hard constraint result.
 *
 * @param {string} name - Stable identifier used for aggregation.
 * @param {boolean} passed
 * @param {string} detail - Human-readable explanation.
 * @returns {HardConstraintResult}
 */
export function hardConstraint(
  name: string,
  passed: boolean,
  detail: string,
): HardConstraintResult {
  return { name, passed, detail };
}

/**
 * Builds a soft score result. The score is clamped to [0, 1] so callers
 * can compute raw deviations without worrying about overflow.
 *
 * @param {string} name
 * @param {number} score - Will be clamped to [0, 1].
 * @param {number} weight
 * @param {string} detail
 * @returns {SoftScoreResult}
 */
export function softScore(
  name: string,
  score: number,
  weight: number,
  detail: string,
): SoftScoreResult {
  const clamped = Math.max(0, Math.min(1, score));
  return { name, score: clamped, weight, detail };
}

/**
 * Convenience builder for a soft score that fully passed (1.0).
 *
 * @param {string} name
 * @param {number} weight
 * @param {string} detail
 * @returns {SoftScoreResult}
 */
export function pass(name: string, weight: number, detail: string): SoftScoreResult {
  return softScore(name, 1.0, weight, detail);
}

/**
 * Convenience builder for a soft score that fully failed (0.0).
 *
 * @param {string} name
 * @param {number} weight
 * @param {string} detail
 * @returns {SoftScoreResult}
 */
export function fail(name: string, weight: number, detail: string): SoftScoreResult {
  return softScore(name, 0.0, weight, detail);
}

/**
 * Tests whether `actual` is within an absolute dollar `tolerance` of `expected`.
 * Used for cent-level sum-equality checks.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} tolerance - Allowed absolute deviation (e.g. 0.01 for $0.01).
 * @returns {boolean}
 */
export function withinTolerance(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * Tests whether `actual` is within a fractional `fraction` of `expected`.
 * Used for projection-math accuracy checks where exact values are not
 * meaningful (rounded forecasts).
 *
 * Falls back to a small absolute tolerance when expected is exactly zero,
 * since 0 has no defined fractional band.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} fraction - e.g. 0.10 for ±10%.
 * @returns {boolean}
 */
export function withinFraction(actual: number, expected: number, fraction: number): boolean {
  if (expected === 0) {
    return Math.abs(actual) <= 0.01;
  }
  return Math.abs(actual - expected) / Math.abs(expected) <= fraction;
}

/**
 * Calculates the number of months required to amortize a balance at a given
 * APR with a fixed monthly payment. Standard amortization formula:
 *
 *   N = -log(1 - (r * P) / M) / log(1 + r)
 *
 * where r is the monthly interest rate, P is the principal, and M is the
 * monthly payment.
 *
 * Returns Infinity if the payment is too small to cover the monthly
 * interest charge (the balance grows forever).
 *
 * @param {number} balance - Current outstanding principal.
 * @param {number} apr - Annual percentage rate as a decimal (e.g. 0.24).
 * @param {number} monthlyPayment
 * @returns {number} Months to payoff, rounded up. Infinity if not feasible.
 */
export function amortizationMonths(balance: number, apr: number, monthlyPayment: number): number {
  if (balance <= 0) return 0;
  if (apr === 0) return Math.ceil(balance / monthlyPayment);
  const r = apr / 12;
  const monthlyInterest = balance * r;
  if (monthlyPayment <= monthlyInterest) return Infinity;
  const months = -Math.log(1 - (r * balance) / monthlyPayment) / Math.log(1 + r);
  return Math.ceil(months);
}

/**
 * Total interest paid over the life of a debt at the given monthly payment.
 * Computed as (monthsToPayoff * monthlyPayment) - principal, capped at 0
 * to avoid tiny negative values from rounding.
 *
 * @param {number} balance
 * @param {number} apr - Annual percentage rate as a decimal.
 * @param {number} monthlyPayment
 * @returns {number} Total interest in dollars. Infinity if payment cannot cover interest.
 */
export function totalInterestPaid(balance: number, apr: number, monthlyPayment: number): number {
  const months = amortizationMonths(balance, apr, monthlyPayment);
  if (months === Infinity) return Infinity;
  return Math.max(0, months * monthlyPayment - balance);
}

/**
 * Computes a normalized rank correlation between two arrays. Returns 1.0
 * when the orderings agree perfectly and 0.0 when they are exact opposites.
 * Defined as the fraction of concordant pairs over all comparable pairs.
 *
 * Used to score whether the agent assigned more surplus to higher-APR debts
 * (avalanche strategy) without requiring an exact match.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} Score in [0, 1]. 1.0 for a single-element array.
 */
export function rankCorrelation(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('rankCorrelation: arrays must have equal length');
  }
  if (a.length < 2) return 1.0;
  let concordant = 0;
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      const da = a[i] - a[j];
      const db = b[i] - b[j];
      if (da === 0 || db === 0) continue;
      total++;
      if (Math.sign(da) === Math.sign(db)) concordant++;
    }
  }
  if (total === 0) return 1.0;
  return concordant / total;
}

/**
 * Computes the weighted mean of an array of soft scores. Returns 0 when the
 * list is empty or every weight is zero (avoids divide-by-zero crashes).
 *
 * @param {SoftScoreResult[]} scores
 * @returns {number} Weighted mean in [0, 1].
 */
export function weightedMean(scores: SoftScoreResult[]): number {
  let total = 0;
  let weightSum = 0;
  for (const s of scores) {
    total += s.score * s.weight;
    weightSum += s.weight;
  }
  if (weightSum === 0) return 0;
  return total / weightSum;
}

/**
 * Computes mean / min / max / population standard deviation across an array
 * of numbers. Empty arrays return all-zero stats so callers do not need to
 * branch on length.
 *
 * @param {number[]} values
 * @returns {SoftScoreStats}
 */
export function computeStats(values: number[]): SoftScoreStats {
  if (values.length === 0) return { mean: 0, min: 0, max: 0, stddev: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, min, max, stddev: Math.sqrt(variance) };
}
