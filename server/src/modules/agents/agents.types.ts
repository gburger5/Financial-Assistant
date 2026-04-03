/**
 * @module agents.types
 * @description Shared TypeScript interfaces for the agent modules (debt, investing).
 * Covers agent input shapes, scheduled payment/contribution outputs, proposal
 * persistence types, and the intermediate account representations used to bridge
 * Plaid data into agent prompts.
 */

import type { BudgetProposal, DebtPaymentPlan, InvestmentPlan } from './core/tools.js';

// ---------------------------------------------------------------------------
// Agent & proposal enums
// ---------------------------------------------------------------------------

/** Discriminant for the kind of agent that produced a proposal. */
export type AgentType = 'budget' | 'debt' | 'investing';

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
