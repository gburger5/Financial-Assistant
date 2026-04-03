/**
 * @module agents.types
 * @description Shared TypeScript interfaces for the agent modules (debt, investing).
 * Covers agent input shapes, scheduled payment/contribution outputs, proposal
 * persistence types, the intermediate account representations used to bridge
 * Plaid data into agent prompts, and the AgentMetrics persistence types.
 */

import type { AgentMetrics } from '@strands-agents/sdk';
import type { BudgetProposal, DebtPaymentPlan, InvestmentPlan } from './core/tools.js';

// ---------------------------------------------------------------------------
// Agent & proposal enums
// ---------------------------------------------------------------------------

/** Discriminant for the kind of agent that produced a proposal. */
export type AgentType = 'budget' | 'debt' | 'investing';

// ---------------------------------------------------------------------------
// Agent invoke result (returned by each invoke* function in core/)
// ---------------------------------------------------------------------------

/**
 * Wraps the structured output from an agent invocation alongside the raw
 * SDK metrics snapshot. Generic over the specific output type (BudgetProposal,
 * DebtPaymentPlan, InvestmentPlan).
 */
export interface AgentInvokeResult<T> {
  output: T;
  metrics: AgentMetrics | undefined;
}

// ---------------------------------------------------------------------------
// Metrics persistence (stored in the AgentMetrics DynamoDB table)
// ---------------------------------------------------------------------------

/**
 * Per-tool statistics stored in an AgentMetricsRecord.
 * Computed from the SDK's ToolMetricsData at record-build time.
 */
export interface StoredToolMetrics {
  callCount: number;
  successCount: number;
  errorCount: number;
  /** Sum of all tool execution durations in milliseconds. */
  totalTimeMs: number;
  /** Average execution duration per call in milliseconds. 0 when callCount is 0. */
  averageTimeMs: number;
  /** Success rate as a percentage (0–100). 100 when callCount is 0. */
  successRate: number;
}

/**
 * Persisted record of a single agent invocation's metrics.
 * PK = userId, SK = metricId (ULID).
 * GSI: agentType (hash) + createdAt (range) for trend queries.
 */
export interface AgentMetricsRecord {
  userId: string;
  metricId: string;
  proposalId: string;
  agentType: AgentType;
  createdAt: string;

  /** Total tokens consumed (input + output). Best practice: monitor for cost thresholds. */
  totalTokens: number;
  /** Prompt tokens sent to the model. */
  inputTokens: number;
  /** Completion tokens returned by the model. */
  outputTokens: number;
  /** Tokens served from the prompt cache (reduces cost). */
  cacheReadTokens: number;
  /** Tokens written to the prompt cache. */
  cacheWriteTokens: number;

  /** Total wall-clock duration of all agent cycles in milliseconds. Best practice: latency baseline. */
  totalDurationMs: number;
  /** Cumulative model API latency across all cycles in milliseconds. */
  modelLatencyMs: number;

  /** Number of agent reasoning cycles executed. Best practice: high counts may indicate prompt/tool issues. */
  cycleCount: number;
  /** Average duration per cycle in milliseconds. */
  averageCycleDurationMs: number;

  /** Per-tool breakdown. Best practice: flag tools with successRate < 95 or high averageTimeMs. */
  toolMetrics: Record<string, StoredToolMetrics>;
}

/** Status lifecycle: pending → approved → executed, or pending → rejected. */
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'executed';

// ---------------------------------------------------------------------------
// Proposal entity (stored in the Proposals DynamoDB table)
// ---------------------------------------------------------------------------

/**
 * A persisted agent execution result. PK = userId, SK = proposalId (ULID).
 * The `result` field holds the structured output from the agent, discriminated
 * by `agentType`.
 */
export interface Proposal {
  userId: string;
  proposalId: string;
  agentType: AgentType;
  status: ProposalStatus;
  result: BudgetProposal | DebtPaymentPlan | InvestmentPlan;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Request body types for agent invocation endpoints
// ---------------------------------------------------------------------------

/** POST /api/agent/debt request body. */
export interface RunDebtAgentBody {
  debtAllocation: number;
}

/** POST /api/agent/investing request body. */
export interface RunInvestingAgentBody {
  investingAllocation: number;
}

export interface DebtAccount {
  account_id: string;
  name: string;
  institution_name: string | null;
  type: "credit_card" | "student_loan" | "mortgage" | "other";
  current_balance: number;
  interest_rate: number | null;
  minimum_payment: number | null;
  next_payment_due_date: string | null;
}

export interface DebtAgentInput {
  userId: string;
  debtAllocation: number;
  debts: DebtAccount[];
}

export interface InvestmentHolding {
  security_name: string;
  ticker_symbol: string | null;
  quantity: number;
  current_value: number;
}

export interface InvestmentAccount {
  account_id: string;
  name: string;
  institution_name: string | null;
  type: "401k" | "ira" | "brokerage" | "other";
  current_balance: number;
  holdings: InvestmentHolding[];
}

export interface InvestingAgentInput {
  userId: string;
  investingAllocation: number;
  accounts: InvestmentAccount[];
  userAge: number | null;
}

/** Debt payment scheduled by the agent, written to Transactions on approval. */
export interface ScheduledPayment {
  plaid_account_id: string;
  amount: number;
  debt_name: string;
  payment_type: "minimum" | "extra" | "payoff";
}

/** Investment contribution scheduled by the agent, written to Transactions on approval. */
export interface ScheduledContribution {
  plaid_account_id: string;
  amount: number;
  account_name: string;
  contribution_type: "401k" | "roth_ira" | "traditional_ira" | "brokerage";
  fund_ticker: string | null;
  fund_name: string | null;
}
