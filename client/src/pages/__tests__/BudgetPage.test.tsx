import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../../context/AuthContext'
import BudgetPage from '../BudgetPage'
import type { Budget } from '../../types/budget'

vi.mock('../../hooks/useBudget', () => ({
  useBudget: vi.fn(),
}))

import { useBudget } from '../../hooks/useBudget'

const mockBudget: Budget = {
  userId: 'u1',
  budgetId: 'b1',
  createdAt: '2026-01-01T00:00:00Z',
  income: { amount: 5000 },
  housing: { amount: 1500 },
  utilities: { amount: 200 },
  transportation: { amount: 400 },
  groceries: { amount: 600 },
  takeout: { amount: 200 },
  shopping: { amount: 300 },
  personalCare: { amount: 100 },
  debts: { amount: 500 },
  investments: { amount: 700 },
}

const authValue = {
  user: { userId: 'u1', email: 'test@example.com' },
  token: 'tok',
  isAuthenticated: true,
  login: vi.fn(),
  logout: vi.fn(),
}

function renderBudget() {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter>
        <BudgetPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('BudgetPage', () => {
  it('renders category bars from budget data', () => {
    vi.mocked(useBudget).mockReturnValue({
      budget: mockBudget,
      loading: false,
      error: null,
      updateBudget: vi.fn(),
      history: [],
      fetchHistory: vi.fn(),
      refetch: vi.fn(),
    })
    renderBudget()
    expect(screen.getByText('Housing')).toBeInTheDocument()
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('Investments')).toBeInTheDocument()
  })

  it('shows empty state when no budget', () => {
    vi.mocked(useBudget).mockReturnValue({
      budget: null,
      loading: false,
      error: null,
      updateBudget: vi.fn(),
      history: [],
      fetchHistory: vi.fn(),
      refetch: vi.fn(),
    })
    renderBudget()
    expect(screen.getByText('No budget found')).toBeInTheDocument()
  })

  it('shows income stat card', () => {
    vi.mocked(useBudget).mockReturnValue({
      budget: mockBudget,
      loading: false,
      error: null,
      updateBudget: vi.fn(),
      history: [],
      fetchHistory: vi.fn(),
      refetch: vi.fn(),
    })
    renderBudget()
    expect(screen.getByText('Monthly Income')).toBeInTheDocument()
  })
})
