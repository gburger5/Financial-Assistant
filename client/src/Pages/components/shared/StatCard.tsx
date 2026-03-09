interface StatCardProps {
  label: string
  value: string
  change: string
  positive: boolean
  icon: string
  iconBg: string
}

const StatCard = ({ label, value, change, positive, icon, iconBg }: StatCardProps) => (
  <div className="stat-card">
    <div className="stat-icon" style={{ background: iconBg }}>{icon}</div>
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
    <div className={`stat-change ${positive ? 'positive' : 'negative'}`}>
      {positive ? '↑' : '↓'} {change}
    </div>
  </div>
)

export default StatCard