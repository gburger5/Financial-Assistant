import { useEffect, useState, useCallback } from 'react'
import { api, ApiError } from '../services/api'

interface UseApiResult<T> {
  data: T | null
  loading: boolean
  error: ApiError | null
  refetch: () => void
}

export function useApi<T>(path: string | null): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(path !== null)
  const [error, setError] = useState<ApiError | null>(null)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (path === null) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    api
      .get<T>(path)
      .then((res) => {
        if (!cancelled) {
          setData(res)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err : new ApiError(0, 'Unknown error'))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [path, tick])

  return { data, loading, error, refetch }
}
