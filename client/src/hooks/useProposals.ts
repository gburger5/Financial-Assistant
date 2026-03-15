import { useCallback } from 'react'
import { useApi } from './useApi'
import { api, ApiError } from '../services/api'
import type { Proposal } from '../types/proposal'

interface UseProposalsResult {
  proposals: Proposal[]
  loading: boolean
  error: ApiError | null
  respond: (proposalId: string, type: string, approved: boolean, reason?: string) => Promise<void>
  remove: (proposalId: string) => Promise<void>
  refetch: () => void
}

export function useProposals(): UseProposalsResult {
  const { data, loading, error, refetch } = useApi<{ proposals: Proposal[] }>('/api/agent/proposals')

  const respond = useCallback(
    async (proposalId: string, type: string, approved: boolean, reason?: string): Promise<void> => {
      await api.post(`/api/agent/${type}/${proposalId}/respond`, {
        approved,
        ...(reason ? { rejectionReason: reason } : {}),
      })
      refetch()
    },
    [refetch],
  )

  const remove = useCallback(
    async (proposalId: string): Promise<void> => {
      await api.delete(`/api/agent/proposals/${proposalId}`)
      refetch()
    },
    [refetch],
  )

  // Agent routes not yet registered — gracefully return empty array on 404
  const proposals = data?.proposals ?? []
  const safeError = error?.status === 404 ? null : error

  return { proposals, loading, error: safeError, respond, remove, refetch }
}
