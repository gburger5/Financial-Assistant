import { Grid } from '@mui/material'
import { MOCK_BUDGET } from '../data/Mockdata'
import PieChart from '../components/shared/PieChart'

const BudgetPage = () => {
  const totalSpent  = MOCK_BUDGET.reduce((a, b) => a + b.spent, 0)
  const totalBudget = MOCK_BUDGET.reduce((a, b) => a + b.budget, 0)

  return (
    <div>
      <div className="inner-page-header">
        <div>
          <div className="page-title">Budget</div>
          <div className="page-subtitle">Monthly spending plan · February 2025</div>
        </div>
        <button className="btn-primary">+ Add Category</button>
      </div>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Budgeted', value: `$${totalBudget.toLocaleString()}`,                                                                    color: '#457B9D' },
          { label: 'Total Spent',    value: `$${totalSpent.toLocaleString()}`,                                                                     color: '#0A2540' },
          { label: 'Remaining',      value: `$${(totalBudget - totalSpent).toLocaleString()}`,                                                     color: '#00A884' },
          { label: 'On Track',       value: `${MOCK_BUDGET.filter(b => b.spent / b.budget < 0.9).length}/${MOCK_BUDGET.length} categories`,        color: '#457B9D' },
        ].map(s => (
          <Grid item xs={6} lg={3} key={s.label}>
            <div className="stat-card" style={{ padding: 16 }}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize: 20, color: s.color }}>{s.value}</div>
            </div>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={5}>
          <div className="section-card">
            <div className="section-card-title" style={{ marginBottom: 18 }}>Spending Breakdown</div>
            <PieChart data={MOCK_BUDGET.map(b => ({ name: b.name, value: b.spent, color: b.color, icon: b.icon }))} />
          </div>
        </Grid>

        <Grid item xs={12} lg={7}>
          <div className="section-card">
            <div className="section-card-title" style={{ marginBottom: 18 }}>Category Progress</div>
            {MOCK_BUDGET.map(b => {
              const pct = Math.round(b.spent / b.budget * 100)
              const over = pct > 90
              return (
                <div key={b.name} style={{ marginBottom: 18 }}>
                  <div className="budget-row-header" style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0A2540' }}>{b.icon} {b.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {over && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', background: 'rgba(239,68,68,0.08)', padding: '2px 8px', borderRadius: 10 }}>
                          ⚠ Near limit
                        </span>
                      )}
                      <span className="budget-cat-amounts" style={{ fontSize: 12 }}>
                        ${b.spent} / ${b.budget}{' '}
                        <span style={{ color: over ? '#EF4444' : '#00A884', fontWeight: 700 }}>({pct}%)</span>
                      </span>
                    </div>
                  </div>
                  <div className="budget-bar-track" style={{ height: 8 }}>
                    <div className="budget-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: over ? '#EF4444' : b.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Grid>
      </Grid>
    </div>
  )
}

export default BudgetPage