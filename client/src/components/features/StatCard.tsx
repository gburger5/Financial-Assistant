import { ReactNode } from 'react'
import Card from '../ui/Card'
import './StatCard.css'

interface StatCardProps {
  icon: ReactNode
  iconBg: string
  label: string
  value: string
  change: string
  positive: boolean
}

export default function StatCard({ icon, iconBg, label, value, change, positive }: StatCardProps) {
  return (
    <Card className="stat-card">
      <div className="stat-card__header">
        <div className="stat-card__icon" style={{ background: iconBg }}>
          {icon}
        </div>
        <span className={`stat-card__change ${positive ? 'stat-card__change--up' : 'stat-card__change--down'}`}>
          {positive ? '↑' : '↓'} {change}
        </span>
      </div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </Card>
  )
}
