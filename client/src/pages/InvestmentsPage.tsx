import { useMemo } from 'react'
import { useApi } from '../hooks/useApi'
import { useProposals } from '../hooks/useProposals'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import Badge from '../components/ui/Badge'
import StatCard from '../components/features/StatCard'
import TransactionRow from '../components/features/TransactionRow'
import ChartCard from '../components/charts/ChartCard'
import DonutChart from '../components/charts/DonutChart'
import type { DonutSlice } from '../components/charts/DonutChart'
import type { Holding } from '../types/holding'
import type { InvestmentTransaction } from '../types/transaction'
import type { InvestmentPlan } from '../types/proposal'
import { TrendingUp, DollarSign, BarChart3, Receipt } from 'lucide-react'
import './InvestmentsPage.css'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtFull = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

const SECURITY_TYPE_COLORS: Record<string, string> = {
  equity: '#6366F1',
  etf: '#14B8A6',
  'mutual fund': '#F59E0B',
  cash: '#64748B',
  cryptocurrency: '#F97316',
  'fixed income': '#06B6D4',
  derivative: '#EC4899',
  loan: '#EF4444',
  other: '#A1A1AA',
}

export default function InvestmentsPage() {
  const { data: holdingsData, loading: holdingsLoading } = useApi<{ holdings: Holding[] }>('/api/investments/holdings')
  const { data: txData } = useApi<{ transactions: InvestmentTransaction[] }>('/api/investments/transactions?limit=10')
  const { proposals } = useProposals()

  const holdings = holdingsData?.holdings ?? []
  const transactions = txData?.transactions ?? []

  // Latest investing proposal
  const investingProposal = useMemo(() => {
    const investing = proposals
      .filter((p) => p.agentType === 'investing')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return investing[0] ?? null
  }, [proposals])

  const plan = investingProposal?.result as unknown as InvestmentPlan | undefined

  // Portfolio stats
  const totalValue = holdings.reduce((sum, h) => sum + h.institutionValue, 0)
  const totalCost = holdings.reduce((sum, h) => sum + (h.costBasis ?? 0), 0)
  const totalGain = totalValue - totalCost
  const gainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0

  // Asset allocation donut
  const allocationSlices: DonutSlice[] = useMemo(() => {
    const byType: Record<string, number> = {}
    for (const h of holdings) {
      const key = h.securityType
      byType[key] = (byType[key] ?? 0) + h.institutionValue
    }
    return Object.entries(byType)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([type, value]) => ({
        name: type.charAt(0).toUpperCase() + type.slice(1),
        value,
        color: SECURITY_TYPE_COLORS[type] ?? '#A1A1AA',
      }))
  }, [holdings])

  if (holdingsLoading) {
    return (
      <div className="investments-page__loading">
        <Spinner size="lg" />
      </div>
    )
  }

  if (holdings.length === 0 && transactions.length === 0) {
    return (
      <div className="investments-page page">
        <EmptyState
          icon={<TrendingUp size={24} />}
          title="No investment data yet"
          description="Connect an investment account to see your portfolio."
        />
      </div>
    )
  }

  return (
    <div className="investments-page page">
      {/* Stat cards */}
      <div className="investments-page__stats">
        <StatCard
          icon={<TrendingUp size={18} />}
          iconBg="rgba(20, 184, 166, 0.15)"
          label="Total Portfolio Value"
          value={fmt.format(totalValue)}
          change={pct(gainPct)}
          positive={totalGain >= 0}
        />
        <StatCard
          icon={<DollarSign size={18} />}
          iconBg="rgba(99, 102, 241, 0.15)"
          label="Total Cost Basis"
          value={fmt.format(totalCost)}
          change={fmtFull.format(totalGain)}
          positive={totalGain >= 0}
        />
        <StatCard
          icon={<BarChart3 size={18} />}
          iconBg="rgba(245, 158, 11, 0.15)"
          label="Unrealized Gain / Loss"
          value={fmtFull.format(totalGain)}
          change={pct(gainPct)}
          positive={totalGain >= 0}
        />
      </div>

      {/* Two-column: donut + projections */}
      <div className="investments-page__columns">
        <ChartCard title="Asset Allocation" subtitle="By security type">
          {allocationSlices.length > 0 ? (
            <DonutChart data={allocationSlices} />
          ) : (
            <EmptyState title="No allocation data" description="Holdings will appear here." />
          )}
        </ChartCard>

        <Card className="investments-page__projections">
          <h4 className="investments-page__section-title">Projections</h4>
          {plan?.projections ? (
            <div className="investments-page__projections-body">
              <div className="investments-page__projections-grid">
                <div className="investments-page__proj-item">
                  <span className="investments-page__proj-label">Retirement Age</span>
                  <span className="investments-page__proj-value">{plan.projections.retirement_age}</span>
                </div>
                <div className="investments-page__proj-item">
                  <span className="investments-page__proj-label">Years to Retirement</span>
                  <span className="investments-page__proj-value">{plan.projections.years_to_retirement}</span>
                </div>
                <div className="investments-page__proj-item">
                  <span className="investments-page__proj-label">Annual Return</span>
                  <span className="investments-page__proj-value">{(plan.projections.assumed_annual_return * 100).toFixed(0)}%</span>
                </div>
                <div className="investments-page__proj-item">
                  <span className="investments-page__proj-label">Total at Retirement</span>
                  <span className="investments-page__proj-value investments-page__proj-value--highlight">
                    {fmt.format(plan.projections.total_at_retirement)}
                  </span>
                </div>
                <div className="investments-page__proj-item">
                  <span className="investments-page__proj-label">Projected Contributions</span>
                  <span className="investments-page__proj-value">{fmt.format(plan.projections.total_projected_contributions)}</span>
                </div>
                <div className="investments-page__proj-item">
                  <span className="investments-page__proj-label">Projected Growth</span>
                  <span className="investments-page__proj-value">{fmt.format(plan.projections.total_projected_growth)}</span>
                </div>
              </div>
              {plan.positive_outcome && (
                <p className="investments-page__positive">{plan.positive_outcome}</p>
              )}
            </div>
          ) : (
            <EmptyState title="No projections yet" description="Run the investing agent to see projections." />
          )}
        </Card>
      </div>

      {/* Holdings table */}
      {holdings.length > 0 && (
        <Card>
          <h4 className="investments-page__section-title">Holdings</h4>
          <div className="investments-page__table-wrapper">
            <table className="investments-page__table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th className="investments-page__num">Qty</th>
                  <th className="investments-page__num">Price</th>
                  <th className="investments-page__num">Value</th>
                  <th className="investments-page__num">Cost Basis</th>
                  <th className="investments-page__num">Gain/Loss</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const gain = h.institutionValue - (h.costBasis ?? 0)
                  const gainP = h.costBasis && h.costBasis > 0 ? (gain / h.costBasis) * 100 : 0
                  return (
                    <tr key={h.snapshotDateAccountSecurity}>
                      <td className="investments-page__ticker">{h.tickerSymbol ?? '-'}</td>
                      <td>{h.securityName ?? 'Unknown'}</td>
                      <td><Badge variant="neutral">{h.securityType}</Badge></td>
                      <td className="investments-page__num">{h.quantity.toFixed(2)}</td>
                      <td className="investments-page__num">{fmtFull.format(h.institutionPrice)}</td>
                      <td className="investments-page__num">{fmtFull.format(h.institutionValue)}</td>
                      <td className="investments-page__num">{h.costBasis != null ? fmtFull.format(h.costBasis) : '-'}</td>
                      <td className={`investments-page__num ${gain >= 0 ? 'investments-page__gain' : 'investments-page__loss'}`}>
                        {fmtFull.format(gain)} ({pct(gainP)})
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Recent transactions */}
      <Card>
        <h4 className="investments-page__section-title">Recent Transactions</h4>
        {transactions.length > 0 ? (
          transactions.map((tx) => (
            <TransactionRow
              key={tx.investmentTransactionId}
              name={tx.name}
              category={tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
              date={tx.date}
              amount={tx.amount}
            />
          ))
        ) : (
          <EmptyState
            icon={<Receipt size={24} />}
            title="No transactions yet"
            description="Investment transactions will appear here after syncing."
          />
        )}
      </Card>
    </div>
  )
}
