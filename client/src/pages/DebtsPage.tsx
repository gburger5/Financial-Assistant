import { useMemo } from 'react'
import { useApi } from '../hooks/useApi'
import { useProposals } from '../hooks/useProposals'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import ProgressBar from '../components/ui/ProgressBar'
import StatCard from '../components/features/StatCard'
import TransactionRow from '../components/features/TransactionRow'
import ChartCard from '../components/charts/ChartCard'
import DonutChart from '../components/charts/DonutChart'
import type { DonutSlice } from '../components/charts/DonutChart'
import type { Account } from '../types/account'
import type { Liability } from '../types/liability'
import type { Transaction } from '../types/transaction'
import type { DebtPaymentPlan } from '../types/proposal'
import { CreditCard, DollarSign, Calendar, TrendingDown, Receipt } from 'lucide-react'
import './DebtsPage.css'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtFull = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

const LIABILITY_TYPE_LABELS: Record<string, string> = {
  credit: 'Credit Card',
  student: 'Student Loan',
  mortgage: 'Mortgage',
}

const LIABILITY_TYPE_COLORS: Record<string, string> = {
  credit: '#EF4444',
  student: '#F59E0B',
  mortgage: '#6366F1',
}

function getMinPayment(liability: Liability): number | null {
  if (liability.liabilityType === 'credit') return liability.details.minimumPaymentAmount
  if (liability.liabilityType === 'student') return liability.details.minimumPaymentAmount
  if (liability.liabilityType === 'mortgage') return liability.details.nextMonthlyPayment
  return null
}

function getApr(liability: Liability): number | null {
  if (liability.liabilityType === 'credit') {
    const purchase = liability.details.aprs.find((a) => a.aprType === 'purchase')
    return purchase?.aprPercentage ?? liability.details.aprs[0]?.aprPercentage ?? null
  }
  if (liability.liabilityType === 'student') return liability.details.interestRatePercentage
  if (liability.liabilityType === 'mortgage') return liability.details.interestRatePercentage
  return null
}

function getNextDueDate(liability: Liability): string | null {
  if (liability.liabilityType === 'credit') return liability.details.nextPaymentDueDate
  return null
}

export default function DebtsPage() {
  const { data: liabilitiesData, loading: liabilitiesLoading } = useApi<{ liabilities: Liability[] }>('/api/liabilities')
  const { data: accountsData } = useApi<{ accounts: Account[] }>('/api/accounts')
  const { data: txData } = useApi<{ transactions: Transaction[] }>('/api/transactions?category=LOAN_PAYMENTS&limit=10')
  const { proposals } = useProposals()

  const liabilities = liabilitiesData?.liabilities ?? []
  const debtAccounts = useMemo(
    () => (accountsData?.accounts ?? []).filter((a) => a.type === 'credit' || a.type === 'loan'),
    [accountsData],
  )
  const transactions = txData?.transactions ?? []

  // Latest debt proposal
  const debtProposal = useMemo(() => {
    const debt = proposals
      .filter((p) => p.agentType === 'debt')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return debt[0] ?? null
  }, [proposals])

  const plan = debtProposal?.result as unknown as DebtPaymentPlan | undefined

  // Totals
  const totalDebt = debtAccounts.reduce((sum, a) => sum + Math.abs(a.currentBalance ?? 0), 0)
  const totalMinPayments = liabilities.reduce((sum, l) => sum + (getMinPayment(l) ?? 0), 0)

  // Debt-free target date
  const debtFreeDate = useMemo(() => {
    if (!plan?.projections?.length) return null
    const maxMonths = Math.max(...plan.projections.map((p) => p.months_to_payoff))
    const date = new Date()
    date.setMonth(date.getMonth() + maxMonths)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }, [plan])

  // Debt breakdown donut
  const debtSlices: DonutSlice[] = useMemo(() => {
    const byType: Record<string, number> = {}
    for (const a of debtAccounts) {
      const liability = liabilities.find((l) => l.plaidAccountId === a.plaidAccountId)
      const type = liability?.liabilityType ?? 'credit'
      byType[type] = (byType[type] ?? 0) + Math.abs(a.currentBalance ?? 0)
    }
    return Object.entries(byType)
      .filter(([, v]) => v > 0)
      .map(([type, value]) => ({
        name: LIABILITY_TYPE_LABELS[type] ?? type,
        value,
        color: LIABILITY_TYPE_COLORS[type] ?? '#A1A1AA',
      }))
  }, [debtAccounts, liabilities])

  // Map account balance by plaidAccountId for debt cards
  const accountBalanceMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const a of debtAccounts) {
      map[a.plaidAccountId] = Math.abs(a.currentBalance ?? 0)
    }
    return map
  }, [debtAccounts])

  if (liabilitiesLoading) {
    return (
      <div className="debts-page__loading">
        <Spinner size="lg" />
      </div>
    )
  }

  if (liabilities.length === 0 && debtAccounts.length === 0) {
    return (
      <div className="debts-page page">
        <EmptyState
          icon={<CreditCard size={24} />}
          title="No debt accounts linked"
          description="Connect a credit card or loan account to see your debts."
        />
      </div>
    )
  }

  return (
    <div className="debts-page page">
      {/* Stat cards */}
      <div className="debts-page__stats">
        <StatCard
          icon={<CreditCard size={18} />}
          iconBg="rgba(239, 68, 68, 0.15)"
          label="Total Debt Outstanding"
          value={fmt.format(totalDebt)}
          change={`${debtAccounts.length} account${debtAccounts.length !== 1 ? 's' : ''}`}
          positive={false}
        />
        <StatCard
          icon={<DollarSign size={18} />}
          iconBg="rgba(245, 158, 11, 0.15)"
          label="Total Minimum Payments"
          value={fmt.format(totalMinPayments)}
          change="per month"
          positive={false}
        />
        {plan?.interest_savings != null && (
          <StatCard
            icon={<TrendingDown size={18} />}
            iconBg="rgba(34, 197, 94, 0.15)"
            label="Interest Saved"
            value={fmt.format(plan.interest_savings)}
            change="vs minimum only"
            positive={true}
          />
        )}
        {debtFreeDate && (
          <StatCard
            icon={<Calendar size={18} />}
            iconBg="rgba(99, 102, 241, 0.15)"
            label="Debt-Free Target"
            value={debtFreeDate}
            change="estimated"
            positive={true}
          />
        )}
      </div>

      {/* Two-column: donut + projections */}
      <div className="debts-page__columns">
        <ChartCard title="Debt Breakdown" subtitle="By type">
          {debtSlices.length > 0 ? (
            <DonutChart data={debtSlices} />
          ) : (
            <EmptyState title="No breakdown data" description="Debt categories will appear here." />
          )}
        </ChartCard>

        <Card className="debts-page__projections">
          <h4 className="debts-page__section-title">Payoff Projections</h4>
          {plan?.projections?.length ? (
            <div className="debts-page__projections-body">
              <div className="debts-page__projections-table-wrapper">
                <table className="debts-page__projections-table">
                  <thead>
                    <tr>
                      <th>Debt</th>
                      <th className="debts-page__num">Balance</th>
                      <th className="debts-page__num">APR</th>
                      <th className="debts-page__num">Months</th>
                      <th className="debts-page__num">Interest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.projections.map((proj) => (
                      <tr key={proj.plaid_account_id}>
                        <td>{proj.debt_name}</td>
                        <td className="debts-page__num">{fmtFull.format(proj.current_balance)}</td>
                        <td className="debts-page__num">{(proj.apr * 100).toFixed(1)}%</td>
                        <td className="debts-page__num">{proj.months_to_payoff}</td>
                        <td className="debts-page__num">{fmtFull.format(proj.total_interest_paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.positive_outcomes && (
                <p className="debts-page__positive">{plan.positive_outcomes}</p>
              )}
            </div>
          ) : (
            <EmptyState title="No projections yet" description="Run the debt agent to see payoff projections." />
          )}
        </Card>
      </div>

      {/* Debt cards with progress bars */}
      {liabilities.length > 0 && (
        <div className="debts-page__debt-cards">
          <h4 className="debts-page__section-title">Your Debts</h4>
          <div className="debts-page__debt-grid">
            {liabilities.map((liability) => {
              const balance = accountBalanceMap[liability.plaidAccountId] ?? 0
              const apr = getApr(liability)
              const minPay = getMinPayment(liability)
              const dueDate = getNextDueDate(liability)
              const account = debtAccounts.find((a) => a.plaidAccountId === liability.plaidAccountId)

              // Payoff progress from proposal projections
              const projection = plan?.projections?.find((p) => p.plaid_account_id === liability.plaidAccountId)
              let progressPct = 0
              if (liability.liabilityType === 'student' && liability.details.originationPrincipalAmount) {
                progressPct = Math.max(0, ((liability.details.originationPrincipalAmount - balance) / liability.details.originationPrincipalAmount) * 100)
              } else if (projection && projection.months_to_payoff > 0) {
                // Use an estimate based on how much has been paid vs total timeline
                progressPct = Math.min(50, (balance > 0 ? 10 : 100))
              }

              const typeLabel = LIABILITY_TYPE_LABELS[liability.liabilityType] ?? liability.liabilityType
              const typeColor = LIABILITY_TYPE_COLORS[liability.liabilityType] ?? '#A1A1AA'

              return (
                <Card key={liability.sortKey} className="debts-page__debt-card">
                  <div className="debts-page__debt-header">
                    <div>
                      <span className="debts-page__debt-name">{account?.name ?? 'Unknown Account'}</span>
                      <Badge variant={liability.liabilityType === 'credit' ? 'danger' : liability.liabilityType === 'student' ? 'warning' : 'info'}>
                        {typeLabel}
                      </Badge>
                    </div>
                    <span className="debts-page__debt-balance">{fmtFull.format(balance)}</span>
                  </div>
                  <div className="debts-page__debt-details">
                    {apr != null && <span>APR: {apr.toFixed(1)}%</span>}
                    {minPay != null && <span>Min: {fmtFull.format(minPay)}/mo</span>}
                    {dueDate && <span>Due: {dueDate}</span>}
                  </div>
                  {progressPct > 0 && (
                    <ProgressBar value={progressPct} color={typeColor} />
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent debt transactions */}
      <Card>
        <h4 className="debts-page__section-title">Recent Debt Payments</h4>
        {transactions.length > 0 ? (
          transactions.map((tx) => (
            <TransactionRow
              key={tx.plaidTransactionId}
              name={tx.merchantName ?? tx.name}
              category={tx.category ?? 'Loan Payment'}
              date={tx.date}
              amount={tx.amount}
            />
          ))
        ) : (
          <EmptyState
            icon={<Receipt size={24} />}
            title="No debt payments yet"
            description="Debt payment transactions will appear here."
          />
        )}
      </Card>
    </div>
  )
}
