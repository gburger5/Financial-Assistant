export type ProposalStatus = 'pending' | 'executed' | 'rejected'
export type ProposalType = 'budget' | 'debt' | 'investing'

export interface Proposal {
  proposalId: string
  type: ProposalType
  status: ProposalStatus
  summary: string
  rationale?: string
  payload?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}
