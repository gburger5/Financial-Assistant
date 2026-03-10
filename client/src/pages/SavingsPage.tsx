import { useBudget } from '../hooks/useBudget'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { PiggyBank, TrendingUp } from 'lucide-react'
import './SavingsPage.css'

export default function SavingsPage() {
  const { budget, loading, error } = useBudget()

  if (loading) return <div className="savings-page__loading"><Spinner size="lg" /></div>

  if (error) {
    return (
      <EmptyState
        icon={<PiggyBank size={24} />}
        title="Couldn't load savings data"
        description={error.message}
      />
    )
  }

  const monthlyContribution = budget?.investments.amount ?? 0
  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)

  return (
    <div className="savings-page page">
      {budget && (
        <Card className="savings-page__contribution">
          <div className="savings-page__contribution-icon">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="savings-page__contribution-label">Monthly Investment Contribution</p>
            <p className="savings-page__contribution-value">{fmt(monthlyContribution)}</p>
          </div>
        </Card>
      )}

      <Card>
        <EmptyState
          icon={<PiggyBank size={24} />}
          title="No savings goals yet"
          description="Savings goals are not yet available. Check back soon."
        />
      </Card>
    </div>
  )
}
