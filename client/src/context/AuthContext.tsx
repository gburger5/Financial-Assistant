import { createContext, useEffect, useState, useCallback, ReactNode } from 'react'
import {
  api,
  setTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
} from '../services/api'
import type { PublicUser, LoginResponse } from '../types/user'

interface AuthContextValue {
  user: PublicUser | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [token, setToken] = useState<string | null>(() => getAccessToken())
  const [ready, setReady] = useState(() => !getAccessToken())

  // On mount, verify the stored access token (the api layer will auto-refresh if needed)
  useEffect(() => {
    const storedToken = getAccessToken()
    if (!storedToken) return

    api
      .get<PublicUser>('/api/auth/verify')
      .then((payload) => {
        setUser(payload)
        setToken(getAccessToken())
      })
      .catch(() => {
        clearTokens()
        setToken(null)
      })
      .finally(() => setReady(true))
  }, [])

  async function login(email: string, password: string): Promise<void> {
    const res = await api.post<LoginResponse>('/api/auth/login', {
      email,
      password,
    })
    setTokens(res.token, res.refreshToken)
    setToken(res.token)
    setUser(res.user)
  }

  const logout = useCallback(async (): Promise<void> => {
    const currentRefresh = getRefreshToken()
    // Best-effort server-side revocation — don't block on failure
    if (currentRefresh) {
      try {
        await api.post('/api/auth/logout', { refreshToken: currentRefresh })
      } catch {
        // Network error or already expired — still clear locally
      }
    }
    clearTokens()
    setToken(null)
    setUser(null)
  }, [])

  if (!ready) return null

  return (
    <AuthContext.Provider
      value={{ user, token, isAuthenticated: !!user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export { AuthContext }