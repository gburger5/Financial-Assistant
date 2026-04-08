/**
 * @module eval.config
 * @description Tunable constants for the eval system. Centralised so the
 * runner, scorers, and tests all share the same thresholds.
 */

/**
 * Number of times each eval case is run by default. LLM outputs are
 * non-deterministic, so a single run is not enough signal — 5 strikes the
 * balance between cost and stability for routine prompt changes.
 */
export const DEFAULT_RUNS_PER_CASE = 5;

/**
 * Dollar tolerance for sum-equality hard constraints. Float arithmetic
 * inside the agent (and Zod's number type) makes exact equality fragile;
 * one cent is enough slack for rounding without masking real bugs.
 */
export const SUM_EQUALITY_TOLERANCE = 0.01;

/**
 * Tolerance (as a fraction of the expected value) for projection math
 * checks. Amortization formulas the agent uses are approximations, so 10%
 * is the right band — tighter than this would fail on legitimate outputs.
 */
export const PROJECTION_MATH_TOLERANCE = 0.10;

/**
 * Tolerance (as a fraction) for the "needs not reduced below actual"
 * budget constraint. Allows the agent a small buffer for rounding without
 * letting it cut needs by 10% or more.
 */
export const NEEDS_REDUCTION_TOLERANCE = 0.05;

/**
 * Pass-rate threshold above which a hard constraint is considered
 * "reliable" across the N runs. Below this, the runner flags the
 * constraint as failing. 0.9 = passes in at least 9/10 runs.
 */
export const HARD_CONSTRAINT_PASS_THRESHOLD = 0.9;

/**
 * APR threshold (decimal, e.g. 0.10 = 10%) above which the budget agent
 * must prioritise debts over investments. Matches the "high APR" guidance
 * implied by the budget system prompt.
 */
export const HIGH_APR_THRESHOLD = 0.10;
