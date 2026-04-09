import { createContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { api } from '../services/api'
import type { PublicUser } from '../types/user'

interface AuthContextValue {
  user: PublicUser | null
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
  const [ready, setReady] = useState(false)

  // On mount, verify the session cookie with the server.
  // If valid, the server returns the current user; otherwise we stay logged out.
  useEffect(() => {
    api
      .get<PublicUser>('/api/auth/verify')
      .then(setUser)
      .catch(() => {})
      .finally(() => setReady(true))
  }, [])

  async function login(email: string, password: string): Promise<void> {
    const res = await api.post<{ user: PublicUser }>('/api/auth/login', { email, password })
    setUser(res.user)
  }

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // Network error — still clear local state
    }
    setUser(null)
  }, [])

  if (!ready) return null

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export { AuthContext }
