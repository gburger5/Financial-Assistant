import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import ProposalCard from '../../features/ProposalCard'
import type { Proposal } from '../../../types/proposal'

const pendingProposal: Proposal = {
  userId: 'u1',
  proposalId: 'p1',
  agentType: 'budget',
  status: 'pending',
  result: { summary: 'Reduce dining out by $100', rationale: 'Based on your spending patterns' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const executedProposal: Proposal = {
  userId: 'u1',
  proposalId: 'p2',
  agentType: 'investing',
  status: 'executed',
  result: { summary: 'Increase 401k contribution' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('ProposalCard', () => {
  it('shows approve and reject buttons only when pending', () => {
    render(
      <ProposalCard
        proposal={pendingProposal}
        onApprove={vi.fn()}
        onExecute={vi.fn()}
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
        onExecute={vi.fn()}
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
        onExecute={vi.fn()}
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
        onExecute={vi.fn()}
        onReject={vi.fn()}
      />,
    )
    expect(screen.getByText('Reduce dining out by $100')).toBeInTheDocument()
  })
})
