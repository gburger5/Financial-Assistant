import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

export interface DonutSlice {
  name: string
  value: number
  color: string
}

interface DonutChartProps {
  data: DonutSlice[]
}

export default function DonutChart({ data }: DonutChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: '#18181b',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '10px',
            color: '#ffffff',
            fontSize: '0.875rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          }}
          itemStyle={{ color: '#ffffff' }}
          labelStyle={{ color: '#d4d4d8', fontWeight: 600, marginBottom: 2 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => {
            const n = typeof value === 'number' ? value : 0
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
