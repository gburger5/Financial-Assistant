import { Grid } from '@mui/material'
import { MOCK_DEBTS } from '../data/Mockdata'

const DebtsPage = () => {
  const total    = MOCK_DEBTS.reduce((a, b) => a + b.balance, 0)
  const minTotal = MOCK_DEBTS.reduce((a, b) => a + b.minimum, 0)

  return (
    <div>
      <div className="inner-page-header">
        <div>
          <div className="page-title">Debt Tracker</div>
          <div className="page-subtitle">Payoff plan & progress</div>
        </div>
        <button className="btn-outline">Payoff Calculator</button>
      </div>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Debt',     value: `$${total.toLocaleString()}`, color: '#EF4444' },
          { label: 'Min. Payments',  value: `$${minTotal}/mo`,            color: '#F59E0B' },
          { label: 'Avg. Interest',  value: '12.1% APR',                  color: '#64748B' },
          { label: 'Est. Debt-Free', value: 'Mar 2027',                   color: '#00A884' },
        ].map(s => (
          <Grid item xs={6} lg={3} key={s.label}>
            <div className="stat-card" style={{ padding: 16 }}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize: 18, color: s.color }}>{s.value}</div>
            </div>
          </Grid>
        ))}
      </Grid>

      <div className="ai-tip-box">
        💡 <strong>AI Suggestion:</strong> Focus on your Chase Sapphire card first — the avalanche method could save ~$840 in interest vs. the snowball method.{' '}
        <button className="btn-primary" style={{ marginLeft: 10, padding: '4px 12px', fontSize: 12 }}>Apply Strategy</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {MOCK_DEBTS.map((d, i) => (
          <div key={i} className={`debt-card-item ${d.severity}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                  {d.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#0A2540', fontSize: 14 }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>{d.type}</div>
                </div>
              </div>
              <span className="debt-interest">🔥 {d.rate}% APR</span>
            </div>
            <div style={{ display: 'flex', gap: 28, fontSize: 13 }}>
              <div><div style={{ color: '#94A3B8', marginBottom: 2, fontSize: 11 }}>Balance</div><strong>${d.balance.toLocaleString()}</strong></div>
              <div><div style={{ color: '#94A3B8', marginBottom: 2, fontSize: 11 }}>Min. Payment</div><strong>${d.minimum}/mo</strong></div>
              <div><div style={{ color: '#94A3B8', marginBottom: 2, fontSize: 11 }}>Strategy</div><strong style={{ color: '#457B9D' }}>{i === 0 ? '🎯 Pay first' : '⏭ After priority'}</strong></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DebtsPage