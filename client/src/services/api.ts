/**
 * @module api
 * Thin HTTP client with automatic access-token refresh on 401.
 *
 * Tokens are stored in httpOnly cookies set by the server — the client
 * never reads or writes them directly. All requests include `credentials:
 * 'include'` so the browser attaches the cookies automatically on every
 * fetch, and the server's Set-Cookie responses are respected.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// ── Error class ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── Refresh logic ───────────────────────────────────────────────────────────

/** Prevent concurrent refresh attempts. */
let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  // Coalesce multiple 401s into one refresh call
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      return res.ok
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// ── Core request function ───────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
  _retried = false,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers as Record<string, string>),
    },
  })

  // On 401, attempt a silent refresh then retry once
  if (res.status === 401 && !_retried) {
    const refreshed = await tryRefresh()
    if (refreshed) return request<T>(path, options, true)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.message || 'Request failed')
  }

  if (res.status === 204) return null as T
  return res.json()
}

// ── Public api object ───────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: <T = null>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      body: body ? JSON.stringify(body) : undefined,
    }),
}
