import { useNavigate } from 'react-router-dom'
import { useBudget } from '../hooks/useBudget'
import StatCard from '../components/features/StatCard'
import BudgetCategoryBar from '../components/features/BudgetCategoryBar'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import {
  DollarSign,
  Home,
  ShoppingBag,
  TrendingUp,
  Utensils,
  Zap,
  Car,
  ShoppingCart,
  Scissors,
  CreditCard,
  PiggyBank,
  Shield,
  Clapperboard,
  HeartPulse,
} from 'lucide-react'
import './BudgetPage.css'

/* Theme-safe colors — visible in both light and dark */
const COLORS = {
  housing:        '#457B9D',
  utilities:      '#3B82F6',
  transportation: '#00D4AA',
  groceries:      '#F59E0B',
  takeout:        '#EF4444',
  shopping:       '#8B5CF6',
  personalCare:   '#EC4899',
  debts:          '#F97316',
  investments:    '#14B8A6',
}

export default function BudgetPage() {
  const { budget, loading, error } = useBudget()
  const navigate = useNavigate()

  if (loading) return <div className="budget-page__loading"><Spinner size="lg" /></div>

  if (error || !budget) {
    return (
      <EmptyState
        icon={<DollarSign size={24} />}
        title="No budget found"
        description="Connect your bank account to generate your personalized budget."
      />
    )
  }

  const needsTotal =
    budget.housing.amount +
    budget.utilities.amount +
    budget.transportation.amount +
    budget.groceries.amount +
    budget.personalCare.amount +
    budget.medical.amount

  const wantsTotal =
    budget.takeout.amount +
    budget.shopping.amount +
    budget.entertainment.amount

  const savingsDebtTotal =
    budget.investments.amount +
    budget.debts.amount +
    budget.emergencyFund.amount

  const income = budget.income.amount

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
  const pct = (v: number) => `${income > 0 ? Math.round((v / income) * 100) : 0}%`

  const categories = [
    { name: 'Housing', icon: <Home size={18} />, amount: budget.housing.amount, color: 'var(--color-chart-1)' },
    { name: 'Utilities', icon: <Zap size={18} />, amount: budget.utilities.amount, color: 'var(--color-chart-2)' },
    { name: 'Transportation', icon: <Car size={18} />, amount: budget.transportation.amount, color: 'var(--color-chart-3)' },
    { name: 'Groceries', icon: <ShoppingCart size={18} />, amount: budget.groceries.amount, color: 'var(--color-chart-4)' },
    { name: 'Medical', icon: <HeartPulse size={18} />, amount: budget.medical.amount, color: '#EC4899' },
    { name: 'Takeout', icon: <Utensils size={18} />, amount: budget.takeout.amount, color: 'var(--color-chart-5)' },
    { name: 'Shopping', icon: <ShoppingBag size={18} />, amount: budget.shopping.amount, color: 'var(--color-chart-6)' },
    { name: 'Personal Care', icon: <Scissors size={18} />, amount: budget.personalCare.amount, color: 'var(--color-chart-7)' },
    { name: 'Entertainment', icon: <Clapperboard size={18} />, amount: budget.entertainment.amount, color: '#8B5CF6' },
    { name: 'Emergency Fund', icon: <Shield size={18} />, amount: budget.emergencyFund.amount, color: '#06B6D4' },
    { name: 'Debts', icon: <CreditCard size={18} />, amount: budget.debts.amount, color: '#F97316' },
    { name: 'Investments', icon: <PiggyBank size={18} />, amount: budget.investments.amount, color: '#14B8A6' },
  ]

  return (
    <div className="budget-page page">
      <div className="budget-page__stat-grid">
        <StatCard
          icon={<DollarSign size={20} />}
          iconBg={COLORS.transportation}
          label="Monthly Income"
          value={fmt(income)}
          change="from bank data"
          positive={true}
        />
        <StatCard
          icon={<Home size={20} />}
          iconBg={COLORS.housing}
          label="Needs"
          value={fmt(needsTotal)}
          change={pct(needsTotal)}
          positive={needsTotal / income < 0.5}
        />
        <StatCard
          icon={<ShoppingBag size={20} />}
          iconBg={COLORS.takeout}
          label="Wants"
          value={fmt(wantsTotal)}
          change={pct(wantsTotal)}
          positive={wantsTotal / income < 0.3}
        />
        <StatCard
          icon={<TrendingUp size={20} />}
          iconBg={COLORS.investments}
          label="Savings & Debt"
          value={fmt(savingsDebtTotal)}
          change={pct(savingsDebtTotal)}
          positive={savingsDebtTotal / income >= 0.2}
        />
      </div>

      <Card>
        <div className="budget-page__categories-header">
          <h3 className="budget-page__categories-title">Budget Categories</h3>
          <Button variant="secondary" size="sm" onClick={() => navigate('/proposals')}>
            Ask Agent to Revise
          </Button>
        </div>
        <div className="budget-page__categories">
          {categories.map((cat) => (
            <BudgetCategoryBar
              key={cat.name}
              name={cat.name}
              icon={cat.icon}
              amount={cat.amount}
              total={income}
              color={cat.color}
            />
          ))}
        </div>
      </Card>
    </div>
  )
}