import { useCallback } from 'react'
import { useApi } from './useApi'
import { api, ApiError } from '../services/api'
import type { Proposal } from '../types/proposal'

interface UseProposalsResult {
  proposals: Proposal[]
  loading: boolean
  error: ApiError | null
  approve: (proposalId: string) => Promise<void>
  execute: (proposalId: string) => Promise<void>
  reject: (proposalId: string) => Promise<void>
  remove: (proposalId: string) => Promise<void>
  refetch: () => void
}

export function useProposals(): UseProposalsResult {
  const { data, loading, error, refetch } = useApi<Proposal[]>('/api/agent/proposals')

  const approve = useCallback(
    async (proposalId: string): Promise<void> => {
      await api.post(`/api/agent/proposals/${proposalId}/approve`)
      await api.post(`/api/agent/proposals/${proposalId}/execute`)
      refetch()
    },
    [refetch],
  )

  const execute = useCallback(
    async (proposalId: string): Promise<void> => {
      await api.post(`/api/agent/proposals/${proposalId}/execute`)
      refetch()
    },
    [refetch],
  )

  const reject = useCallback(
    async (proposalId: string): Promise<void> => {
      await api.post(`/api/agent/proposals/${proposalId}/reject`)
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

  const proposals = data ?? []
  // Agent routes not yet registered — gracefully return empty array on 404
  const safeError = error?.status === 404 ? null : error

  return { proposals, loading, error: safeError, approve, execute, reject, remove, refetch }
}
