import { useCallback, useState } from 'react'
import { useApi } from './useApi'
import { api } from '../services/api'
import type { Budget, BudgetUpdateInput } from '../types/budget'
import type { ApiError } from '../services/api'

interface UseBudgetResult {
  budget: Budget | null
  loading: boolean
  error: ApiError | null
  updateBudget: (updates: BudgetUpdateInput) => Promise<void>
  history: Budget[]
  fetchHistory: () => Promise<void>
  refetch: () => void
}

export function useBudget(): UseBudgetResult {
  const { data: budget, loading, error, refetch } = useApi<Budget>('/api/budget')
  const [history, setHistory] = useState<Budget[]>([])

  const updateBudget = useCallback(
    async (updates: BudgetUpdateInput): Promise<void> => {
      await api.patch('/api/budget', updates)
      refetch()
    },
    [refetch],
  )

  const fetchHistory = useCallback(async (): Promise<void> => {
    const data = await api.get<Budget[]>('/api/budget/history')
    setHistory(data)
  }, [])

  return { budget, loading, error, updateBudget, history, fetchHistory, refetch }
}
