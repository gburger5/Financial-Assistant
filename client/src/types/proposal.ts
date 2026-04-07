export type ProposalStatus = 'pending' | 'executed' | 'rejected'
export type ProposalType = 'budget' | 'debt' | 'investing'

export interface ProposalResult {
  summary?: string
  rationale?: string
  [key: string]: unknown
}

export interface Proposal {
  proposalId: string
  userId?: string
  type?: ProposalType
  agentType?: string
  status: ProposalStatus
  summary?: string
  rationale?: string
  result?: ProposalResult
  payload?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

export interface DebtPaymentPlan {
  projections?: Array<{
    plaid_account_id: string
    debt_name: string
    current_balance: number
    apr: number
    months_to_payoff: number
    total_interest_paid: number
  }>
  interest_savings?: number
  positive_outcomes?: string
}

export interface InvestmentPlan {
  projections?: {
    retirement_age: number
    years_to_retirement: number
    assumed_annual_return: number
    total_at_retirement: number
    total_projected_contributions: number
    total_projected_growth: number
  }
  positive_outcome?: string
}