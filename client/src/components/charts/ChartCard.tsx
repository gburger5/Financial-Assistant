import { ReactNode } from 'react'
import Card from '../ui/Card'
import './ChartCard.css'

interface ChartCardProps {
  title: string
  subtitle?: string
  children: ReactNode
}

export default function ChartCard({ title, subtitle, children }: ChartCardProps) {
  return (
    <Card className="chart-card">
      <div className="chart-card__header">
        <h4 className="chart-card__title">{title}</h4>
        {subtitle && <p className="chart-card__subtitle">{subtitle}</p>}
      </div>
      <div className="chart-card__body">{children}</div>
    </Card>
  )
}
