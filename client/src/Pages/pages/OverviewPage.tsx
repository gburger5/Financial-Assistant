import { Grid } from '@mui/material'
import type { PageId } from '../types/dashboard'
import { MOCK_BUDGET, MOCK_SUGGESTIONS, MOCK_TRANSACTIONS } from '../data/Mockdata'
import StatCard from '../components/shared/StatCard'

interface OverviewPageProps {
  goTo: (p: PageId) => void
}

const OverviewPage = ({ goTo }: OverviewPageProps) => (
  <div>
    <div className="welcome-bar">
      <div>
        <div className="welcome-name">Good morning, Alex 👋</div>
        <div className="welcome-date">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>
      <div className="welcome-net-worth">
        <div className="welcome-net-worth-label">Est. Net Worth</div>
        <div className="welcome-net-worth-value">$47,320</div>
      </div>
    </div>

    <Grid container spacing={2} sx={{ mb: 3 }}>
      {[
        { label: 'Total Balance',    value: '$24,840', change: '3.2% this month',   positive: true,  icon: '🏦', iconBg: 'rgba(0,212,170,0.1)'  },
        { label: 'Monthly Income',   value: '$4,000',  change: '$750 freelance',     positive: true,  icon: '💰', iconBg: 'rgba(69,123,157,0.1)' },
        { label: 'Monthly Expenses', value: '$2,614',  change: '8.1% vs last month', positive: false, icon: '💸', iconBg: 'rgba(239,68,68,0.1)'  },
      ].map(s => (
        <Grid item xs={12} sm={4} key={s.label}>
          <StatCard {...s} />
        </Grid>
      ))}
    </Grid>

    <Grid container spacing={3}>
      {/* AI Suggestions */}
      <Grid item xs={12} lg={8}>
        <div className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div className="section-card-title">💡 AI Suggestions</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                Nothing happens until you approve — review each suggestion before acting.
              </div>
            </div>
          </div>
          {MOCK_SUGGESTIONS.map((a, i) => (
            <div key={i} className="agent-action-item">
              <div className="agent-action-icon" style={{ background: a.iconBg }}>{a.icon}</div>
              <div style={{ flex: 1 }}>
                <div className="agent-action-title">{a.title}</div>
                <div className="agent-action-desc">{a.desc}</div>
                <div className="agent-action-time">{a.time}</div>
              </div>
              <div className="agent-action-status">
                {a.status === 'completed' ? (
                  <span className="status-badge completed">✓ Done</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>Approve</button>
                    <button className="btn-outline" style={{ padding: '4px 10px', fontSize: 11 }}>Dismiss</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Grid>

      {/* Quick Actions */}
      <Grid item xs={12} lg={4}>
        <div className="section-card">
          <div className="section-card-title">Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {([
              { label: 'View Transactions', sub: 'Browse & filter activity', icon: '💳', iconBg: 'rgba(69,123,157,0.12)', page: 'transactions' as PageId },
              { label: 'Manage Budget',     sub: 'Adjust category limits',   icon: '📋', iconBg: 'rgba(0,212,170,0.12)',  page: 'budget'       as PageId },
              { label: 'Track Goals',       sub: 'Check savings progress',   icon: '🎯', iconBg: 'rgba(245,158,11,0.12)', page: 'goals'        as PageId },
              { label: 'Review Debts',      sub: 'Payoff plan & tracking',   icon: '💰', iconBg: 'rgba(239,68,68,0.12)',  page: 'debts'        as PageId },
            ]).map(a => (
              <button key={a.label} className="quick-action-btn" onClick={() => goTo(a.page)}>
                <div className="quick-action-icon" style={{ background: a.iconBg }}>{a.icon}</div>
                <div>
                  <div className="quick-action-label">{a.label}</div>
                  <div className="quick-action-sub">{a.sub}</div>
                </div>
                <span className="quick-action-arrow">›</span>
              </button>
            ))}
          </div>
        </div>
      </Grid>

      {/* Budget Overview */}
      <Grid item xs={12} lg={6}>
        <div className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="section-card-title">Budget Overview</div>
            <button className="btn-outline" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => goTo('budget')}>Manage</button>
          </div>
          {MOCK_BUDGET.slice(0, 4).map(b => (
            <div key={b.name} className="budget-row">
              <div className="budget-row-header">
                <span className="budget-cat-name">{b.icon} {b.name}</span>
                <span className="budget-cat-amounts">${b.spent} / ${b.budget}</span>
              </div>
              <div className="budget-bar-track">
                <div className="budget-bar-fill" style={{
                  width: `${Math.min(100, Math.round(b.spent / b.budget * 100))}%`,
                  background: b.spent / b.budget > 0.9 ? '#EF4444' : b.color,
                }} />
              </div>
            </div>
          ))}
        </div>
      </Grid>

      {/* Recent Transactions */}
      <Grid item xs={12} lg={6}>
        <div className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="section-card-title">Recent Transactions</div>
            <button className="btn-outline" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => goTo('transactions')}>View All</button>
          </div>
          {MOCK_TRANSACTIONS.slice(0, 5).map(t => (
            <div key={t.id} className="transaction-item">
              <div className="transaction-icon" style={{ background: t.iconBg }}>{t.icon}</div>
              <div>
                <div className="transaction-name">{t.name}</div>
                <div className="transaction-cat">{t.category} · {t.date}</div>
              </div>
              <div className={`transaction-amount ${t.amount > 0 ? 'credit' : 'debit'}`}>
                {t.amount > 0 ? '+' : ''}${Math.abs(t.amount).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </Grid>
    </Grid>
  </div>
)

export default OverviewPage