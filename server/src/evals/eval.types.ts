/**
 * @module eval.types
 * @description Type definitions for the agent evaluation system. Eval cases
 * describe an input scenario plus mock data for the service-layer mocks the
 * runner installs. Scorers convert agent outputs into hard constraint and
 * soft score results, which the runner aggregates across N runs per case.
 */

import type { Account } from '../modules/accounts/accounts.types.js';
import type { Holding } from '../modules/investments/investments.types.js';
import type { Liability } from '../modules/liabilities/liabilities.types.js';
import type { PublicUser } from '../modules/auth/auth.service.js';
import type { Budget } from '../modules/budget/budget.types.js';
import type {
  DebtAgentInput,
  InvestingAgentInput,
} from '../modules/agents/agents.types.js';
import type {
  BudgetProposal,
  DebtPaymentPlan,
  InvestmentPlan,
} from '../modules/agents/core/tools.js';

/** Discriminant for which agent an eval case targets. */
export type EvalAgentType = 'budget' | 'debt' | 'investing';

/**
 * Mock data injected into the service layer before invoking the agent.
 * Field shapes match the real service return types exactly so the real
 * tool callbacks (which wrap, validate, and shape these) execute unchanged.
 */
export interface EvalMockData {
  /** getAccountsForUser return value. */
  accounts: Account[];
  /** getLatestHoldings return value. */
  holdings: Holding[];
  /** getLiabilitiesForUser return value. */
  liabilities: Liability[];
  /** getUserById return value (only firstName/lastName/birthday are read). */
  user: PublicUser;
}

/** Eval case targeting the budget agent. */
export interface BudgetEvalCase {
  id: string;
  name: string;
  description: string;
  agentType: 'budget';
  input: {
    userId: string;
    /** Real Budget shape — uses BudgetAmount wrappers ({ amount: number }). */
    budget: Budget;
  };
  mockData: EvalMockData;
}

/** Eval case targeting the debt agent. */
export interface DebtEvalCase {
  id: string;
  name: string;
  description: string;
  agentType: 'debt';
  input: DebtAgentInput;
  mockData: EvalMockData;
}

/** Eval case targeting the investing agent. */
export interface InvestingEvalCase {
  id: string;
  name: string;
  description: string;
  agentType: 'investing';
  input: InvestingAgentInput;
  mockData: EvalMockData;
}

/** Discriminated union over all eval case shapes. */
export type EvalCase = BudgetEvalCase | DebtEvalCase | InvestingEvalCase;

/** Result of a single hard constraint check. */
export interface HardConstraintResult {
  /** Stable identifier for the constraint (used for aggregation). */
  name: string;
  passed: boolean;
  /** Human-readable explanation of why it passed or failed. */
  detail: string;
}

/** Result of a single soft score check. */
export interface SoftScoreResult {
  /** Stable identifier for the score (used for aggregation). */
  name: string;
  /** Score in [0, 1]. */
  score: number;
  /** Relative importance multiplier for the weighted mean. */
  weight: number;
  /** Human-readable explanation of how the score was derived. */
  detail: string;
}

/**
 * Score computed for one agent output against one eval case in one run.
 * The runner produces N of these per case (one per iteration) and the
 * aggregator collapses them into an EvalCaseResult.
 */
export interface SingleRunScore {
  hardConstraints: HardConstraintResult[];
  softScores: SoftScoreResult[];
  /** True iff every hard constraint passed. */
  allHardConstraintsPassed: boolean;
  /** Weighted mean of soft scores in [0, 1]. */
  weightedSoftScore: number;
  /** The raw agent output, kept for debugging. */
  rawOutput: unknown;
  durationMs: number;
}

/** Aggregated stats across N runs for one soft score. */
export interface SoftScoreStats {
  mean: number;
  min: number;
  max: number;
  stddev: number;
}

/** Aggregated result across N runs for one eval case. */
export interface EvalCaseResult {
  caseId: string;
  caseName: string;
  agentType: EvalAgentType;
  runCount: number;
  /** Per-constraint pass rate in [0, 1]. */
  hardConstraintPassRate: Record<string, number>;
  /** Per-soft-score statistics. */
  softScoreStats: Record<string, SoftScoreStats>;
  /** Fraction of runs in which every hard constraint passed. */
  overallPassRate: number;
  /** Mean weighted soft score across runs. */
  meanWeightedSoftScore: number;
  /** Median wall-clock duration of one run, in milliseconds. */
  medianDurationMs: number;
  /** All raw run scores, kept for debugging. */
  runs: SingleRunScore[];
}

/** Top-level output of one full eval suite invocation. */
export interface EvalSuiteResult {
  runId: string;
  timestamp: string;
  modelId: string;
  config: {
    runsPerCase: number;
    tolerancePercent: number;
  };
  results: EvalCaseResult[];
  summary: {
    totalCases: number;
    totalRuns: number;
    overallHardConstraintPassRate: number;
    overallMeanSoftScore: number;
  };
}

/**
 * Type alias for any agent output the scorers handle. Each scorer narrows
 * to its own concrete output type internally.
 */
export type AnyAgentOutput = BudgetProposal | DebtPaymentPlan | InvestmentPlan;
