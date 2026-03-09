import { Grid } from '@mui/material'
import { MOCK_GOALS } from '../data/Mockdata'

const GoalsPage = () => (
  <div>
    <div className="inner-page-header">
      <div>
        <div className="page-title">Savings Goals</div>
        <div className="page-subtitle">Track progress toward your targets</div>
      </div>
      <button className="btn-primary">+ New Goal</button>
    </div>

    <Grid container spacing={2}>
      {MOCK_GOALS.map(g => {
        const pct = Math.min(100, Math.round(g.saved / g.target * 100))
        const done = pct >= 100
        return (
          <Grid item xs={12} sm={6} key={g.name}>
            <div className="goal-card-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `${g.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {g.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0A2540', fontSize: 14 }}>{g.name}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>📅 {g.deadline}</div>
                  </div>
                </div>
                {done && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#00A884', background: 'rgba(0,212,170,0.1)', padding: '3px 10px', borderRadius: 20 }}>
                    ✓ Complete
                  </span>
                )}
              </div>
              <div className="goal-progress-row">
                <span className="goal-pct" style={{ color: done ? '#00A884' : '#0A2540' }}>{pct}%</span>
                <div className="goal-bar-track">
                  <div className="goal-bar-fill" style={{ width: `${pct}%`, background: done ? '#00D4AA' : g.color }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#64748B' }}>Saved: <strong style={{ color: '#0A2540' }}>${g.saved.toLocaleString()}</strong></span>
                <span style={{ color: '#94A3B8' }}>Target: ${g.target.toLocaleString()}</span>
              </div>
            </div>
          </Grid>
        )
      })}
    </Grid>
  </div>
)

export default GoalsPage