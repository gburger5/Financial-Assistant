import { useState } from 'react'
import { useProposals } from '../hooks/useProposals'
import ProposalCard from '../components/features/ProposalCard'
import FilterChips from '../components/features/FilterChips'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { FileText } from 'lucide-react'
import type { Proposal } from '../types/proposal'
import './ProposalsPage.css'

const TYPE_OPTIONS = ['All', 'Budget', 'Debt', 'Investing']
const STATUS_OPTIONS = ['All', 'Pending', 'Executed', 'Rejected']

export default function ProposalsPage() {
  const { proposals, loading, respond, remove } = useProposals()
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')

  if (loading) return <div className="proposals-page__loading"><Spinner size="lg" /></div>

  const filtered = proposals.filter((p) => {
    const matchType = typeFilter === 'All' || p.type === typeFilter.toLowerCase()
    const matchStatus = statusFilter === 'All' || p.status === statusFilter.toLowerCase()
    return matchType && matchStatus
  })

  return (
    <div className="proposals-page page">
      <div className="proposals-page__filters">
        <FilterChips options={TYPE_OPTIONS} selected={typeFilter} onChange={setTypeFilter} />
        <FilterChips options={STATUS_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />
      </div>

      {proposals.length === 0 ? (
        <EmptyState
          icon={<FileText size={24} />}
          title="No proposals yet"
          description="AI-generated budget and investing proposals will appear here once the agent is enabled."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText size={24} />}
          title="No matching proposals"
          description="Try adjusting your filters."
        />
      ) : (
        <div className="proposals-page__list">
          {filtered.map((p) => (
            <ProposalCard
              key={p.proposalId}
              proposal={p as Proposal}
              onApprove={(id) => respond(id, p.type, true)}
              onReject={(id) => respond(id, p.type, false)}
              onDelete={(id) => remove(id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
