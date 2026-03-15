import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import ProposalCard from '../../features/ProposalCard'
import type { Proposal } from '../../features/ProposalCard'

const pendingProposal: Proposal = {
  proposalId: 'p1',
  type: 'budget',
  status: 'pending',
  summary: 'Reduce dining out by $100',
  rationale: 'Based on your spending patterns',
}

const executedProposal: Proposal = {
  proposalId: 'p2',
  type: 'investing',
  status: 'executed',
  summary: 'Increase 401k contribution',
}

describe('ProposalCard', () => {
  it('shows approve and reject buttons only when pending', () => {
    render(
      <ProposalCard
        proposal={pendingProposal}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('hides approve and reject buttons when not pending', () => {
    render(
      <ProposalCard
        proposal={executedProposal}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })

  it('calls onApprove with proposal id when approved', async () => {
    const onApprove = vi.fn()
    render(
      <ProposalCard
        proposal={pendingProposal}
        onApprove={onApprove}
        onReject={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onApprove).toHaveBeenCalledWith('p1')
  })

  it('shows summary text', () => {
    render(
      <ProposalCard
        proposal={pendingProposal}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    )
    expect(screen.getByText('Reduce dining out by $100')).toBeInTheDocument()
  })
})
