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
