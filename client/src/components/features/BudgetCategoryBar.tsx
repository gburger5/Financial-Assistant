import { ReactNode } from 'react'
import ProgressBar from '../ui/ProgressBar'
import './BudgetCategoryBar.css'

interface BudgetCategoryBarProps {
  name: string
  icon: ReactNode
  amount: number
  total: number
  color: string
}

export default function BudgetCategoryBar({ name, icon, amount, total, color }: BudgetCategoryBarProps) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  return (
    <div className="budget-cat">
      <div className="budget-cat__row">
        <div className="budget-cat__left">
          <span className="budget-cat__icon">{icon}</span>
          <span className="budget-cat__name">{name}</span>
        </div>
        <div className="budget-cat__right">
          <span className="budget-cat__amount">{formatted}</span>
          <span className="budget-cat__pct">{pct}%</span>
        </div>
      </div>
      <ProgressBar value={pct} color={color} />
    </div>
  )
}
