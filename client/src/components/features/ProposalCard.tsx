import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import './ProposalCard.css'

export interface Proposal {
  proposalId: string
  type: 'budget' | 'debt' | 'investing'
  agentType?: string
  status: 'pending' | 'executed' | 'rejected'
  summary: string
  rationale?: string
  result?: unknown
  createdAt?: string
}

interface ProposalCardProps {
  proposal: Proposal
  onApprove: (id: string) => void
  onExecute?: (id: string) => void
  onReject: (id: string) => void
  onDelete?: (id: string) => void
}

const TYPE_VARIANT: Record<string, 'info' | 'warning' | 'success'> = {
  budget: 'info',
  debt: 'warning',
  investing: 'success',
}

const STATUS_VARIANT: Record<string, 'neutral' | 'success' | 'danger'> = {
  pending: 'neutral',
  executed: 'success',
  rejected: 'danger',
}

export default function ProposalCard({ proposal, onApprove, onReject, onDelete }: ProposalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null)
  const [loading, setLoading] = useState(false)

  const displayType = proposal.agentType ?? proposal.type

  async function handleConfirmedAction() {
    if (!confirmAction) return
    setLoading(true)
    try {
      if (confirmAction === 'approve') {
        await onApprove(proposal.proposalId)
      } else {
        await onReject(proposal.proposalId)
      }
    } finally {
      setLoading(false)
      setConfirmAction(null)
    }
  }

  return (
    <Card className="proposal-card">
      <div className="proposal-card__header">
        <div className="proposal-card__badges">
          <Badge variant={TYPE_VARIANT[displayType] ?? 'info'}>{displayType}</Badge>
          <Badge variant={STATUS_VARIANT[proposal.status] ?? 'neutral'}>{proposal.status}</Badge>
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

      <p className="proposal-card__summary">{proposal.summary}</p>

      {proposal.rationale && (
        <div className="proposal-card__rationale">
          <button
            className="proposal-card__rationale-toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? 'Hide rationale' : 'Show rationale'}
          </button>
          {expanded && <p className="proposal-card__rationale-text">{proposal.rationale}</p>}
        </div>
      )}

      {proposal.status === 'pending' && (
        <div className="proposal-card__actions">
          {confirmAction ? (
            <div className="proposal-card__action-confirm">
              <p className="proposal-card__action-confirm-text">
                {confirmAction === 'approve'
                  ? 'Are you sure you want to approve this proposal? This will apply the changes to your budget.'
                  : 'Are you sure you want to reject this proposal?'}
              </p>
              <div className="proposal-card__action-confirm-btns">
                <Button
                  variant={confirmAction === 'approve' ? 'primary' : 'danger'}
                  size="sm"
                  disabled={loading}
                  onClick={handleConfirmedAction}
                >
                  {loading
                    ? (confirmAction === 'approve' ? 'Approving…' : 'Rejecting…')
                    : (confirmAction === 'approve' ? 'Yes, approve' : 'Yes, reject')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={loading}
                  onClick={() => setConfirmAction(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button variant="primary" size="sm" onClick={() => setConfirmAction('approve')}>
                Approve
              </Button>
              <Button variant="danger" size="sm" onClick={() => setConfirmAction('reject')}>
                Reject
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  )
}