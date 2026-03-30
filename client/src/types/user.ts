export interface PublicUser {
  userId: string
  firstName?: string
  lastName?: string
  email: string
  createdAt?: string
  agentBudgetApproved?: boolean
  birthday?: string
}

export interface AuthState {
  user: PublicUser | null
  token: string | null
  isAuthenticated: boolean
}

export interface LoginResponse {
  user: PublicUser
  token: string
}
