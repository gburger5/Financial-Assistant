import { useEffect, useReducer, useCallback } from 'react'
import { api, ApiError } from '../services/api'

interface UseApiResult<T> {
  data: T | null
  loading: boolean
  error: ApiError | null
  refetch: () => void
}

type State<T> = { data: T | null; loading: boolean; error: ApiError | null; tick: number }

type Action<T> =
  | { type: 'start' }
  | { type: 'done'; data: T }
  | { type: 'fail'; error: ApiError }
  | { type: 'tick' }

function reduce<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case 'start': return { ...state, loading: true, error: null }
    case 'done':  return { ...state, data: action.data, loading: false }
    case 'fail':  return { ...state, error: action.error, loading: false }
    case 'tick':  return { ...state, loading: true, tick: state.tick + 1 }
  }
}

export function useApi<T>(path: string | null): UseApiResult<T> {
  const [state, dispatch] = useReducer(reduce<T>, {
    data: null,
    loading: path !== null,
    error: null,
    tick: 0,
  })

  const refetch = useCallback(() => dispatch({ type: 'tick' }), [])

  useEffect(() => {
    if (path === null) return

    let cancelled = false
    dispatch({ type: 'start' })

    api
      .get<T>(path)
      .then((res) => {
        if (!cancelled) dispatch({ type: 'done', data: res })
      })
      .catch((err: unknown) => {
        if (!cancelled)
          dispatch({ type: 'fail', error: err instanceof ApiError ? err : new ApiError(0, 'Unknown error') })
      })

    return () => { cancelled = true }
  }, [path, state.tick])

  return { data: state.data, loading: state.loading, error: state.error, refetch }
}
