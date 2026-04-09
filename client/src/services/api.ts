/**
 * @module api
 * Thin HTTP client with automatic access-token refresh on 401.
 *
 * Tokens are held in module-scoped variables (memory) and mirrored to
 * localStorage so they persist across tabs and browser sessions, allowing
 * returning users to remain logged in without re-authenticating.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// ── Token store (in-memory + localStorage mirror) ────────────────────────

let accessToken: string | null = localStorage.getItem('token')
let refreshToken: string | null = localStorage.getItem('refreshToken')

/** Persist both tokens. Called after login and after a successful refresh. */
export function setTokens(access: string, refresh: string): void {
  accessToken = access
  refreshToken = refresh
  localStorage.setItem('token', access)
  localStorage.setItem('refreshToken', refresh)
}

/** Clear both tokens. Called on logout or when refresh fails. */
export function clearTokens(): void {
  accessToken = null
  refreshToken = null
  localStorage.removeItem('token')
  localStorage.removeItem('refreshToken')
}

export function getAccessToken(): string | null {
  return accessToken
}

export function getRefreshToken(): string | null {
  return refreshToken
}

// ── Error class ─────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── Refresh logic ───────────────────────────────────────────────────────

/** Prevent concurrent refresh attempts. */
let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false

  // Coalesce multiple 401s into one refresh call
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) {
        clearTokens()
        return false
      }
      const data = await res.json()
      setTokens(data.accessToken, data.refreshToken)
      return true
    } catch {
      clearTokens()
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// ── Core request function ───────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
  _retried = false,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  })

  // On 401, attempt a silent refresh then retry once
  if (res.status === 401 && !_retried) {
    const refreshed = await tryRefresh()
    if (refreshed) return request<T>(path, options, true)
    // Refresh failed — fall through to throw an ApiError so callers can redirect
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.message || 'Request failed')
  }

  if (res.status === 204) return null as T
  return res.json()
}

// ── Public api object ───────────────────────────────────────────────────

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