import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import './DonutChart.css'

export interface DonutSlice {
  name: string
  value: number
  color: string
}

interface DonutChartProps {
  data: DonutSlice[]
  showLegend?: boolean
  showTotal?: boolean
}

const DONUT_PALETTE = [
  '#457B9D',
  '#00D4AA',
  '#F59E0B',
  '#EF4444',
  '#3B82F6',
  '#8B5CF6',
  '#14B8A6',
  '#EC4899',
  '#F97316',
]

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v)

const pct = (value: number, total: number) =>
  total > 0 ? `${Math.round((value / total) * 100)}%` : '0%'

export default function DonutChart({
  data,
  showLegend = true,
  showTotal = true,
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  const safeData = data.map((d, i) => ({
    ...d,
    color: d.color.startsWith('var(') ? DONUT_PALETTE[i % DONUT_PALETTE.length] : d.color,
  }))

  return (
    <div className="donut">
      {/* Chart with center label */}
      <div className="donut__chart-wrap">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={safeData}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={78}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {safeData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {showTotal && (
          <div className="donut__center">
            <span className="donut__center-amount">{fmt(total)}</span>
            <span className="donut__center-label">Total</span>
          </div>
        )}
      </div>

      {/* Compact legend */}
      {showLegend && (
        <div className="donut__legend">
          {safeData.map((entry) => (
            <div key={entry.name} className="donut__legend-row">
              <span className="donut__legend-dot" style={{ background: entry.color }} />
              <span className="donut__legend-name">{entry.name}</span>
              <span className="donut__legend-val">{fmt(entry.value)}</span>
              <span className="donut__legend-pct">{pct(entry.value, total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}