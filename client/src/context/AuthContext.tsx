import { createContext, useEffect, useState, ReactNode } from 'react'
import { api } from '../services/api'
import type { PublicUser, LoginResponse } from '../types/user'

interface AuthContextValue {
  user: PublicUser | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  // Initialize as ready when there is no stored token — no async work needed.
  const [ready, setReady] = useState(() => !localStorage.getItem('token'))

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) return

    api
      .get<PublicUser>('/api/auth/verify')
      .then((payload) => {
        setUser(payload)
        setToken(storedToken)
      })
      .catch(() => {
        localStorage.removeItem('token')
        setToken(null)
      })
      .finally(() => setReady(true))
  }, [])

  async function login(email: string, password: string): Promise<void> {
    const res = await api.post<LoginResponse>('/api/auth/login', { email, password })
    localStorage.setItem('token', res.token)
    setToken(res.token)
    setUser(res.user)
  }

  function logout(): void {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

  if (!ready) return null

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export { AuthContext }
