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
import type { Transaction } from '../types/transaction'
import { LayoutDashboard, Receipt, RefreshCw } from 'lucide-react'
import './DashboardPage.css'

export default function DashboardPage() {
  const { user } = useAuth()
  const { budget, loading, error } = useBudget()
  const { data: txData, refetch: refetchTx } = useApi<{ transactions: Transaction[] }>('/api/transactions?limit=20')
  const [syncing, setSyncing] = useState(false)

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await api.post('/api/plaid/sync')
      refetchTx()
    } finally {
      setSyncing(false)
    }
  }, [refetchTx])

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

  // Build chart data from real budget
  const donutSlices: DonutSlice[] = budget
    ? [
        { name: 'Housing', value: budget.housing.amount, color: 'var(--color-chart-1)' },
        { name: 'Utilities', value: budget.utilities.amount, color: 'var(--color-chart-2)' },
        { name: 'Transportation', value: budget.transportation.amount, color: 'var(--color-chart-3)' },
        { name: 'Groceries', value: budget.groceries.amount, color: 'var(--color-chart-4)' },
        { name: 'Takeout', value: budget.takeout.amount, color: 'var(--color-chart-5)' },
        { name: 'Shopping', value: budget.shopping.amount, color: 'var(--color-chart-6)' },
        { name: 'Personal Care', value: budget.personalCare.amount, color: 'var(--color-chart-7)' },
        { name: 'Debts', value: budget.debts.amount, color: '#F97316' },
        { name: 'Investments', value: budget.investments.amount, color: '#14B8A6' },
      ].filter((s) => s.value > 0)
    : []

  const barData: BarDataPoint[] = budget
    ? [
        { label: 'Income', value: budget.income.amount },
        {
          label: 'Expenses',
          value:
            budget.housing.amount +
            budget.utilities.amount +
            budget.transportation.amount +
            budget.groceries.amount +
            budget.takeout.amount +
            budget.shopping.amount +
            budget.personalCare.amount +
            budget.debts.amount,
        },
        { label: 'Investments', value: budget.investments.amount },
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
          subtitle={budget ? `Monthly income: $${budget.income.amount.toLocaleString()}` : ''}
        >
          {budget && barData.some((d) => d.value > 0) ? (
            <BarChart data={barData} color="var(--color-chart-1)" />
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
          {budget && budget.investments.amount > 0 ? (
            <div className="dashboard-page__invest-stat">
              <span className="dashboard-page__invest-amount">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(budget.investments.amount)}
              </span>
              <span className="dashboard-page__invest-sub">
                {budget.income.amount > 0
                  ? `${((budget.investments.amount / budget.income.amount) * 100).toFixed(1)}% of monthly income`
                  : 'per month'}
              </span>
              <div className="dashboard-page__invest-bar-bg">
                <div
                  className="dashboard-page__invest-bar-fill"
                  style={{ width: `${Math.min((budget.investments.amount / budget.income.amount) * 100, 100)}%` }}
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
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
        {txData?.transactions && txData.transactions.length > 0 ? (
          txData.transactions.map((tx) => (
            <TransactionRow
              key={tx.plaidTransactionId}
              name={tx.merchantName ?? tx.name}
              category={tx.category ?? 'Uncategorized'}
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
