import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useApi } from '../useApi'

describe('useApi', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token')
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('returns loading=true initially', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const { result } = renderHook(() => useApi<{ id: string }>('/api/test'))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('returns data on success', async () => {
    const mockData = { id: '123' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    }))

    const { result } = renderHook(() => useApi<{ id: string }>('/api/test'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(mockData)
    expect(result.current.error).toBeNull()
  })

  it('returns error on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Server error' }),
    }))

    const { result } = renderHook(() => useApi<unknown>('/api/test'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).not.toBeNull()
    expect(result.current.error?.message).toBe('Server error')
    expect(result.current.data).toBeNull()
  })

  it('skips fetch when path is null', () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    const { result } = renderHook(() => useApi<unknown>(null))
    expect(result.current.loading).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
