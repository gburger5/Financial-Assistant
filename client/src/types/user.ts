export interface PublicUser {
  userId: string
  firstName?: string
  lastName?: string
  email: string
  createdAt?: string
  agentBudgetApproved?: boolean
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
