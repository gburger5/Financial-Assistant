import { useState, useCallback } from 'react'
import { useBudget } from '../hooks/useBudget'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import ChartCard from '../components/charts/ChartCard'
import DonutChart from '../components/charts/DonutChart'
import BarChart from '../components/charts/BarChart'
import type { DonutSlice } from '../components/charts/DonutChart'
import type { BarDataPoint } from '../components/charts/BarChart'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import Card from '../components/ui/Card'
import TransactionRow from '../components/features/TransactionRow'
import type { Transaction, InvestmentTransaction } from '../types/transaction'
import { LayoutDashboard, Receipt, RefreshCw } from 'lucide-react'
import './DashboardPage.css'

/*
 * Theme-safe chart palette — visible in both light and dark mode.
 * These are NOT CSS vars so they don't change with data-theme.
 */
const CHART_COLORS = {
  housing:        '#457B9D',
  utilities:      '#3B82F6',
  transportation: '#00D4AA',
  groceries:      '#F59E0B',
  takeout:        '#EF4444',
  shopping:       '#8B5CF6',
  personalCare:   '#EC4899',
<<<<<<< HEAD
=======
  entertainment:  '#A78BFA',
  medical:        '#F472B6',
  emergencyFund:  '#06B6D4',
>>>>>>> c62ef6e (Created devMock for testing, changed dashboard to have better design and incorporate light and dark)
  debts:          '#F97316',
  investments:    '#14B8A6',
  income:         '#00D4AA',
  expenses:       '#457B9D',
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { budget, loading, error } = useBudget()
  const { data: txData, refetch: refetchTx } = useApi<{ transactions: Transaction[] }>('/api/transactions?limit=20')
  const { data: invTxData, refetch: refetchInvTx } = useApi<{ transactions: InvestmentTransaction[] }>('/api/investments/transactions?limit=20')
  const [syncing, setSyncing] = useState(false)

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await api.post('/api/plaid/sync')
      refetchTx()
      refetchInvTx()
    } finally {
      setSyncing(false)
    }
  }, [refetchTx, refetchInvTx])

  // Merge regular and investment transactions, sorted newest-first
  const allTransactions: Array<{ key: string; name: string; category: string; date: string; amount: number }> = []
  if (txData?.transactions) {
    for (const tx of txData.transactions) {
      allTransactions.push({
        key: tx.plaidTransactionId,
        name: tx.merchantName ?? tx.name,
        category: tx.category ?? 'Uncategorized',
        date: tx.date,
        amount: tx.amount,
      })
    }
  }
  if (invTxData?.transactions) {
    for (const tx of invTxData.transactions) {
      allTransactions.push({
        key: tx.investmentTransactionId,
        name: tx.name,
        category: tx.type.charAt(0).toUpperCase() + tx.type.slice(1),
        date: tx.date,
        amount: tx.amount,
      })
    }
  }
  allTransactions.sort((a, b) => b.date.localeCompare(a.date))
  const recentTransactions = allTransactions.slice(0, 20)

  const firstName = user?.firstName ?? user?.email.split('@')[0] ?? 'there'

  if (loading) {
    return (
      <div className="dashboard-page__loading">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        icon={<LayoutDashboard size={24} />}
        title="Couldn't load budget"
        description={error.message}
      />
    )
  }

const donutSlices: DonutSlice[] = budget
  ? [
      { name: 'Housing',        value: budget.housing?.amount ?? 0,        color: CHART_COLORS.housing },
      { name: 'Utilities',      value: budget.utilities?.amount ?? 0,      color: CHART_COLORS.utilities },
      { name: 'Transportation', value: budget.transportation?.amount ?? 0, color: CHART_COLORS.transportation },
      { name: 'Groceries',      value: budget.groceries?.amount ?? 0,      color: CHART_COLORS.groceries },
      { name: 'Takeout',        value: budget.takeout?.amount ?? 0,        color: CHART_COLORS.takeout },
      { name: 'Shopping',       value: budget.shopping?.amount ?? 0,       color: CHART_COLORS.shopping },
      { name: 'Personal Care',  value: budget.personalCare?.amount ?? 0,   color: CHART_COLORS.personalCare },
      { name: 'Entertainment',  value: budget.entertainment?.amount ?? 0,  color: CHART_COLORS.entertainment },
      { name: 'Medical',        value: budget.medical?.amount ?? 0,        color: CHART_COLORS.medical },
      { name: 'Emergency Fund', value: budget.emergencyFund?.amount ?? 0,  color: CHART_COLORS.emergencyFund },
      { name: 'Debts',          value: budget.debts?.amount ?? 0,          color: CHART_COLORS.debts },
      { name: 'Investments',    value: budget.investments?.amount ?? 0,    color: CHART_COLORS.investments },
    ].filter((s) => s.value > 0)
  : []

  const barData: BarDataPoint[] = budget
    ? [
        { label: 'Income', value: budget.income?.amount ?? 0 },
        {
          label: 'Expenses',
          value:
            (budget.housing?.amount ?? 0) +
            (budget.utilities?.amount ?? 0) +
            (budget.transportation?.amount ?? 0) +
            (budget.groceries?.amount ?? 0) +
            (budget.takeout?.amount ?? 0) +
            (budget.shopping?.amount ?? 0) +
            (budget.personalCare?.amount ?? 0) +
            (budget.entertainment?.amount ?? 0) +
            (budget.medical?.amount ?? 0) +
            (budget.debts?.amount ?? 0),
        },
        {
          label: 'Savings',
          value: (budget.investments?.amount ?? 0) + (budget.emergencyFund?.amount ?? 0),
        },
      ]
    : []

  return (
    <div className="dashboard-page page">
      <div className="dashboard-page__greeting">
        <h2 className="dashboard-page__greeting-text">Good day, {firstName}</h2>
        <p className="dashboard-page__greeting-sub">Here's your financial overview.</p>
      </div>

      <div className="dashboard-page__charts">
        <ChartCard
          title="Income vs Expenses"
          subtitle={budget ? `Monthly income: $${(budget.income?.amount ?? 0).toLocaleString()}` : ''}
        >
          {budget && barData.some((d) => d.value > 0) ? (
            <BarChart data={barData} />
          ) : (
            <EmptyState title="No budget data" description="Connect your bank to see your budget." />
          )}
        </ChartCard>

        <ChartCard title="Spending Breakdown" subtitle="By category">
          {budget && donutSlices.length > 0 ? (
            <DonutChart data={donutSlices} />
          ) : (
            <EmptyState title="No categories yet" description="Spending categories will appear here." />
          )}
        </ChartCard>

        <ChartCard title="Savings & Investments" subtitle="Monthly allocation">
          {budget && (budget.investments?.amount ?? 0) > 0 ? (
            <div className="dashboard-page__invest-stat">
              <span className="dashboard-page__invest-amount">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(budget.investments?.amount ?? 0)}
              </span>
              <span className="dashboard-page__invest-sub">
                {(budget.income?.amount ?? 0) > 0
                  ? `${(((budget.investments?.amount ?? 0) / (budget.income?.amount ?? 1)) * 100).toFixed(1)}% of monthly income`
                  : 'per month'}
              </span>
              <div className="dashboard-page__invest-bar-bg">
                <div
                  className="dashboard-page__invest-bar-fill"
                  style={{ width: `${Math.min(((budget.investments?.amount ?? 0) / (budget.income?.amount ?? 1)) * 100, 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <EmptyState title="No investment data" description="Investment allocation will appear here." />
          )}
        </ChartCard>
      </div>

      <Card>
        <div className="dashboard-page__transactions-header">
          <h3 className="dashboard-page__transactions-title">Recent Transactions</h3>
          <button
            className="dashboard-page__sync-btn"
            onClick={handleSync}
            disabled={syncing}
            aria-label="Sync transactions"
          >
            <RefreshCw size={14} className={syncing ? 'dashboard-page__sync-icon--spinning' : ''} />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
        {recentTransactions.length > 0 ? (
          recentTransactions.map((tx) => (
            <TransactionRow
              key={tx.key}
              name={tx.name}
              category={tx.category}
              date={tx.date}
              amount={tx.amount}
            />
          ))
        ) : (
          <EmptyState
            icon={<Receipt size={24} />}
            title="No transactions yet"
            description="Transactions will appear here after your bank syncs."
          />
        )}
      </Card>
    </div>
  )
}