export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'executed'
export type AgentType = 'budget' | 'debt' | 'investing'
/** @deprecated Use AgentType instead. */
export type ProposalType = AgentType

export interface Proposal {
  userId: string
  proposalId: string
  agentType: AgentType
  status: ProposalStatus
  result: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

/** Structured result returned by the debt agent. */
export interface DebtPaymentPlan {
  summary: string
  rationale: string
  scheduled_payments: {
    plaid_account_id: string
    debt_name: string
    amount: number
    payment_type: 'minimum' | 'extra' | 'payoff'
  }[]
  projections: {
    plaid_account_id: string
    debt_name: string
    current_balance: number
    apr: number
    months_to_payoff: number
    total_interest_paid: number
  }[]
  interest_savings: number
  positive_outcomes: string
}

/** Structured result returned by the investing agent. */
export interface InvestmentPlan {
  summary: string
  rationale: string
  scheduled_contributions: {
    plaid_account_id: string
    account_name: string
    amount: number
    contribution_type: '401k' | 'roth_ira' | 'traditional_ira' | 'brokerage'
    fund_ticker: string | null
    fund_name: string | null
  }[]
  projections: {
    retirement_age: number
    years_to_retirement: number
    assumed_annual_return: number
    total_projected_contributions: number
    total_projected_growth: number
    total_at_retirement: number
    holdings: {
      fund_ticker: string
      fund_name: string
      current_value: number
      projected_value_at_retirement: number
    }[]
  }
  positive_outcome: string
}

/** Structured result returned by the budget agent. */
export interface BudgetProposal {
  summary: string
  rationale: string
  income: number
  housing: number
  utilities: number
  transportation: number
  groceries: number
  takeout: number
  shopping: number
  personalCare: number
  emergencyFund: number
  entertainment: number
  medical: number
  debts: number
  investments: number
}
