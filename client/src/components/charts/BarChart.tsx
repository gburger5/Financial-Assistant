import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  LabelList,
} from 'recharts'
import './BarChart.css'

export interface BarDataPoint {
  label: string
  value: number
  color?: string
}

interface BarChartProps {
  data: BarDataPoint[]
  color?: string
  showValues?: boolean
}

/* Hardcoded palette so bars are always visible in both themes */
const BAR_PALETTE = [
  '#00D4AA', // teal — always visible on both light and dark
  '#457B9D', // steel blue
  '#14B8A6', // mint
  '#F59E0B', // amber
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EF4444', // red
]

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v)

export default function BarChart({ data, color, showValues = true }: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 0)

  return (
    <div className="bar-chart">
      <ResponsiveContainer width="100%" height={360}>
        <ReBarChart data={data} margin={{ top: 24, right: 4, bottom: 4, left: 4 }}>
          <CartesianGrid
            stroke="var(--color-border)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={52}
            domain={[0, Math.ceil(maxValue * 1.15 / 1000) * 1000]}
            tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-bg-hover)', opacity: 0.5 }}
            contentStyle={{
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '10px',
              color: 'var(--color-text-primary)',
              fontSize: '0.875rem',
              boxShadow: 'var(--shadow-md)',
            }}
            formatter={(value: number | string | undefined) => {
              const n = typeof value === 'number' ? value : 0
              return fmt(n)
            }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
            {data.map((entry, i) => (
              <Cell
                key={entry.label}
                fill={entry.color || color || BAR_PALETTE[i % BAR_PALETTE.length]}
              />
            ))}
            {showValues && (
              <LabelList
                dataKey="value"
                position="top"
                formatter={((v: unknown) => fmt(typeof v === 'number' ? v : 0)) as never}
                style={{
                  fill: 'var(--color-text-dimmed)',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              />
            )}
          </Bar>
        </ReBarChart>
      </ResponsiveContainer>
    </div>
  )
}