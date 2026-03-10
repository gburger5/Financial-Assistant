import { ReactNode } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import ProgressBar from '../ui/ProgressBar'
import './SavingGoalCard.css'

interface SavingGoalCardProps {
  name: string
  icon: ReactNode
  saved: number
  target: number
  deadline: string
  color: string
}

export default function SavingGoalCard({ name, icon, saved, target, deadline, color }: SavingGoalCardProps) {
  const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0
  const complete = pct >= 100
  const fmt = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)

  return (
    <Card className="saving-goal">
      <div className="saving-goal__header">
        <div className="saving-goal__icon">{icon}</div>
        <div className="saving-goal__title-group">
          <span className="saving-goal__name">{name}</span>
          <span className="saving-goal__deadline">{deadline}</span>
        </div>
        {complete && <Badge variant="success">Complete</Badge>}
      </div>
      <div className="saving-goal__amounts">
        <span className="saving-goal__saved">{fmt(saved)}</span>
        <span className="saving-goal__target">of {fmt(target)}</span>
      </div>
      <ProgressBar value={pct} color={color} />
      <span className="saving-goal__pct">{pct}%</span>
    </Card>
  )
}
