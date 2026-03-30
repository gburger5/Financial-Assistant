import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import type { Proposal } from '../../types/proposal'
import './ProposalCard.css'

interface ProposalCardProps {
  proposal: Proposal
  onApprove: (id: string) => void
  onExecute: (id: string) => void
  onReject: (id: string) => void
  onDelete?: (id: string) => void
}

const TYPE_VARIANT: Record<Proposal['agentType'], 'info' | 'warning' | 'success'> = {
  budget: 'info',
  debt: 'warning',
  investing: 'success',
}

const STATUS_VARIANT: Record<Proposal['status'], 'neutral' | 'info' | 'success' | 'danger'> = {
  pending: 'neutral',
  approved: 'info',
  executed: 'success',
  rejected: 'danger',
}

export default function ProposalCard({ proposal, onApprove, onExecute, onReject, onDelete }: ProposalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const summary = (proposal.result as { summary?: string })?.summary ?? ''
  const rationale = (proposal.result as { rationale?: string })?.rationale

  return (
    <Card className="proposal-card">
      <div className="proposal-card__header">
        <div className="proposal-card__badges">
          <Badge variant={TYPE_VARIANT[proposal.agentType]}>{proposal.agentType}</Badge>
          <Badge variant={STATUS_VARIANT[proposal.status]}>{proposal.status}</Badge>
        </div>
        {confirmDelete ? (
          <div className="proposal-card__delete-confirm">
            <span className="proposal-card__delete-confirm-label">Delete?</span>
            <button
              className="proposal-card__delete-confirm-yes"
              onClick={() => onDelete?.(proposal.proposalId)}
            >
              Yes
            </button>
            <button
              className="proposal-card__delete-confirm-no"
              onClick={() => setConfirmDelete(false)}
            >
              No
            </button>
          </div>
        ) : (
          <button
            className="proposal-card__delete-btn"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete proposal"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
      <p className="proposal-card__summary">{summary}</p>
      {rationale && (
        <div className="proposal-card__rationale">
          <button
            className="proposal-card__rationale-toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? 'Hide rationale' : 'Show rationale'}
          </button>
          {expanded && <p className="proposal-card__rationale-text">{rationale}</p>}
        </div>
      )}
      {proposal.status === 'pending' && (
        <div className="proposal-card__actions">
          <Button variant="primary" size="sm" onClick={() => onApprove(proposal.proposalId)}>
            Approve
          </Button>
          <Button variant="danger" size="sm" onClick={() => onReject(proposal.proposalId)}>
            Reject
          </Button>
        </div>
      )}
      {proposal.status === 'approved' && (
        <div className="proposal-card__actions">
          <Button variant="primary" size="sm" onClick={() => onExecute(proposal.proposalId)}>
            Execute
          </Button>
        </div>
      )}
    </Card>
  )
}
