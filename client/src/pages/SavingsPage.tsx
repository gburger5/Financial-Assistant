import { useEffect, useMemo } from 'react'
import { useBudget } from '../hooks/useBudget'
import { useApi } from '../hooks/useApi'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import ProgressBar from '../components/ui/ProgressBar'
import StatCard from '../components/features/StatCard'
import ChartCard from '../components/charts/ChartCard'
import BarChart from '../components/charts/BarChart'
import type { BarDataPoint } from '../components/charts/BarChart'
import type { Account } from '../types/account'
import { PiggyBank, Shield, Percent } from 'lucide-react'
import './SavingsPage.css'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtFull = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function SavingsPage() {
  const { budget, loading, error, history, fetchHistory } = useBudget()
  const { data: accountsData } = useApi<{ accounts: Account[] }>('/api/accounts')

  useEffect(() => { fetchHistory() }, [fetchHistory])

  // Filter savings accounts
  const savingsAccounts = useMemo(
    () => (accountsData?.accounts ?? []).filter(a => a.type === 'depository' && a.subtype === 'savings'),
    [accountsData],
  )

  // Identify emergency fund account by name
  const efAccount = useMemo(
    () => savingsAccounts.find(a =>
      a.name.toLowerCase().includes('emergency') ||
      (a.officialName?.toLowerCase().includes('emergency') ?? false)
    ) ?? null,
    [savingsAccounts],
  )

  // Computed values
  const income = budget?.income.amount ?? 0
  const efContribution = budget?.emergencyFund.amount ?? 0
  const efBalance = efAccount?.currentBalance ?? 0
  const threeMonthTarget = income * 3
  const sixMonthTarget = income * 6

  const progressPct = sixMonthTarget > 0 ? Math.min(100, (efBalance / sixMonthTarget) * 100) : 0
  const threeMonthReached = efBalance >= threeMonthTarget && threeMonthTarget > 0
  const sixMonthReached = efBalance >= sixMonthTarget && sixMonthTarget > 0

  const monthsTo3 = efContribution > 0 && threeMonthTarget > efBalance
    ? Math.ceil((threeMonthTarget - efBalance) / efContribution)
    : null
  const monthsTo6 = efContribution > 0 && sixMonthTarget > efBalance
    ? Math.ceil((sixMonthTarget - efBalance) / efContribution)
    : null

  const savingsRate = income > 0
    ? ((efContribution + (budget?.investments.amount ?? 0)) / income * 100).toFixed(1)
    : 'N/A'

  // History bar chart data
  const historyData: BarDataPoint[] = useMemo(() => {
    if (!history.length) return []
    return history
      .slice()
      .reverse()
      .slice(-12)
      .map(b => {
        const date = new Date(b.createdAt)
        return {
          label: date.toLocaleDateString('en-US', { month: 'short' }),
          value: b.emergencyFund.amount,
        }
      })
  }, [history])

  if (loading) {
    return <div className="savings-page__loading"><Spinner size="lg" /></div>
  }

  if (error) {
    return (
      <EmptyState
        icon={<PiggyBank size={24} />}
        title="Couldn't load savings data"
        description={error.message}
      />
    )
  }

  return (
    <div className="savings-page page">
      {/* Stat cards */}
      <div className="savings-page__stats">
        <StatCard
          icon={<Percent size={18} />}
          iconBg="rgba(99, 102, 241, 0.15)"
          label="Savings Rate"
          value={savingsRate === 'N/A' ? 'N/A' : `${savingsRate}%`}
          change="of income"
          positive={Number(savingsRate) >= 20}
        />
        <StatCard
          icon={<Shield size={18} />}
          iconBg="rgba(20, 184, 166, 0.15)"
          label="Monthly Emergency Fund Contribution"
          value={fmt.format(efContribution)}
          change="per month"
          positive={efContribution > 0}
        />
      </div>

      {/* Emergency Fund section */}
      <Card className="savings-page__ef">
        <h4 className="savings-page__section-title">Emergency Fund</h4>
        {efAccount ? (
          <>
            <div className="savings-page__ef-summary">
              <span className="savings-page__ef-balance">{fmtFull.format(efBalance)}</span>
              <span className="savings-page__ef-account">
                {efAccount.name}{efAccount.mask ? ` ••${efAccount.mask}` : ''}
              </span>
              {sixMonthReached ? (
                <Badge variant="success">6-Month Target Reached</Badge>
              ) : threeMonthReached ? (
                <Badge variant="info">3-Month Target Reached</Badge>
              ) : (
                <Badge variant="neutral">Building</Badge>
              )}
            </div>

            {income > 0 && (
              <div className="savings-page__ef-progress">
                <div className="savings-page__ef-bar-container">
                  <ProgressBar value={progressPct} color="#14B8A6" />
                  <div className="savings-page__ef-milestone" aria-label="3-month target" />
                </div>
                <div className="savings-page__ef-labels">
                  <span>$0</span>
                  <span>3mo: {fmt.format(threeMonthTarget)}</span>
                  <span>6mo: {fmt.format(sixMonthTarget)}</span>
                </div>
              </div>
            )}

            <div className="savings-page__ef-details">
              <div className="savings-page__ef-detail">
                <span className="savings-page__ef-detail-label">Months to 3-Month Target</span>
                <span className="savings-page__ef-detail-value">
                  {threeMonthReached ? 'Reached' : monthsTo3 != null ? `${monthsTo3} mo` : 'N/A'}
                </span>
              </div>
              <div className="savings-page__ef-detail">
                <span className="savings-page__ef-detail-label">Months to 6-Month Target</span>
                <span className="savings-page__ef-detail-value">
                  {sixMonthReached ? 'Reached' : monthsTo6 != null ? `${monthsTo6} mo` : 'N/A'}
                </span>
              </div>
              <div className="savings-page__ef-detail">
                <span className="savings-page__ef-detail-label">Monthly Contribution</span>
                <span className="savings-page__ef-detail-value">{fmtFull.format(efContribution)}</span>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<Shield size={24} />}
            title="No emergency fund account found"
            description="We look for a savings account with 'emergency' in its name. Make sure your emergency fund account is linked and named accordingly."
          />
        )}
      </Card>

      {/* Two-column: accounts list + contribution history */}
      <div className="savings-page__columns">
        <Card>
          <h4 className="savings-page__section-title">Savings Accounts</h4>
          {savingsAccounts.length > 0 ? (
            savingsAccounts.map(a => {
              const isEf = a.plaidAccountId === efAccount?.plaidAccountId
              return (
                <div
                  key={a.plaidAccountId}
                  className={`savings-page__account-row ${isEf ? 'savings-page__account-row--highlighted' : ''}`}
                >
                  <div className="savings-page__account-info">
                    <span className="savings-page__account-name">{a.name}</span>
                    <span className="savings-page__account-mask">{a.mask ? `••${a.mask}` : ''}</span>
                    {isEf && <Badge variant="success">Emergency Fund</Badge>}
                  </div>
                  <span className="savings-page__account-balance">
                    {fmtFull.format(a.currentBalance ?? 0)}
                  </span>
                </div>
              )
            })
          ) : (
            <EmptyState
              icon={<PiggyBank size={24} />}
              title="No savings accounts linked"
              description="Link a savings account to track your progress."
            />
          )}
        </Card>

        <ChartCard title="EF Contribution History" subtitle="Monthly allocation over time">
          {historyData.length > 0 ? (
            <BarChart data={historyData} color="#14B8A6" />
          ) : (
            <EmptyState
              title="No history yet"
              description="Contribution history will appear as your budget updates."
            />
          )}
        </ChartCard>
      </div>
    </div>
  )
}
