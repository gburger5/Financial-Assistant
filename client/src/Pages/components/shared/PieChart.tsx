type PieDatum = { name: string; value: number; color: string; icon: string }
type PieSlice = PieDatum & { path: string; angle: number; pct: number }

interface PieChartProps {
  data: PieDatum[]
}

const PieChart = ({ data }: PieChartProps) => {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  const slices = data.reduce<{ items: PieSlice[]; cumAngle: number }>(
    (acc, d) => {
      const angle = (d.value / total) * 360
      const startAngle = acc.cumAngle
      const endAngle = acc.cumAngle + angle
      const toRad = (deg: number) => (deg * Math.PI) / 180
      const cx = 90, cy = 90, r = 80
      const x1 = cx + r * Math.cos(toRad(startAngle))
      const y1 = cy + r * Math.sin(toRad(startAngle))
      const x2 = cx + r * Math.cos(toRad(endAngle - 0.5))
      const y2 = cy + r * Math.sin(toRad(endAngle - 0.5))
      const largeArc = angle > 180 ? 1 : 0
      const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
      return {
        items: [...acc.items, { ...d, path, angle, pct: Math.round((d.value / total) * 100) }],
        cumAngle: endAngle,
      }
    },
    { items: [], cumAngle: -90 }
  ).items

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg width="180" height="180" viewBox="0 0 180 180" style={{ flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth="2" />
        ))}
        <circle cx="90" cy="90" r="44" fill="#fff" />
        <text x="90" y="86" textAnchor="middle" fontSize="11" fill="#64748B" fontWeight="600">Spent</text>
        <text x="90" y="102" textAnchor="middle" fontSize="14" fill="#0A2540" fontWeight="800">
          ${data.reduce((s, d) => s + d.value, 0).toLocaleString()}
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 140 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#334155', flex: 1 }}>{s.icon} {s.name}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0A2540' }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PieChart