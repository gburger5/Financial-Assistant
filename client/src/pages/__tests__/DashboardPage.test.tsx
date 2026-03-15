import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../../context/AuthContext'
import DashboardPage from '../DashboardPage'
import type { Budget } from '../../types/budget'

vi.mock('../../hooks/useBudget', () => ({
  useBudget: vi.fn(),
}))

vi.mock('recharts', () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
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
  user: { userId: 'u1', email: 'test@example.com', firstName: 'Test' },
  token: 'tok',
  isAuthenticated: true,
  login: vi.fn(),
  logout: vi.fn(),
}

function renderDashboard() {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('DashboardPage', () => {
  it('shows loading spinner initially', () => {
    vi.mocked(useBudget).mockReturnValue({
      budget: null,
      loading: true,
      error: null,
      updateBudget: vi.fn(),
      history: [],
      fetchHistory: vi.fn(),
      refetch: vi.fn(),
    })
    renderDashboard()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders budget data when loaded', () => {
    vi.mocked(useBudget).mockReturnValue({
      budget: mockBudget,
      loading: false,
      error: null,
      updateBudget: vi.fn(),
      history: [],
      fetchHistory: vi.fn(),
      refetch: vi.fn(),
    })
    renderDashboard()
    expect(screen.getByText(/Good day/)).toBeInTheDocument()
  })

  it('renders transaction empty state', () => {
    vi.mocked(useBudget).mockReturnValue({
      budget: mockBudget,
      loading: false,
      error: null,
      updateBudget: vi.fn(),
      history: [],
      fetchHistory: vi.fn(),
      refetch: vi.fn(),
    })
    renderDashboard()
    expect(screen.getByText('No transactions yet')).toBeInTheDocument()
  })
})
