import {
  LineChart as ReLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

export interface LineDataPoint {
  label: string
  value: number
}

interface LineChartProps {
  data: LineDataPoint[]
  color?: string
}

export default function LineChart({ data, color = 'var(--color-chart-1)' }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ReLineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
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
          width={48}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            color: 'var(--color-text-primary)',
            fontSize: '0.875rem',
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => {
            const n = typeof value === 'number' ? value : 0
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: color }}
        />
      </ReLineChart>
    </ResponsiveContainer>
  )
}
