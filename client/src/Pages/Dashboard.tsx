import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Grid } from '@mui/material'
import { getToken, clearToken } from '../utils/auth'
import './Dashboard.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Types 
type PageId =
  | 'overview' | 'transactions' | 'budget' | 'investments'
  | 'goals' | 'debts' | 'reports' | 'notifications' | 'profile' | 'settings'

interface Notification {
  id: number
  icon: string
  iconBg: string
  title: string
  desc: string
  time: string
  unread: boolean
  type: 'alert' | 'tip' | 'action' | 'update'
}

interface SettingsState {
  theme: 'light' | 'dark' | 'system'
  currency: 'USD' | 'EUR' | 'GBP'
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
  budgetPeriod: 'monthly' | 'weekly' | 'biweekly'
  budgetRollover: boolean
  budgetAlerts: boolean
  emailNotifs: boolean
  pushNotifs: boolean
  goalReminders: boolean
  weeklyReport: boolean
  twoFactor: boolean
  dataSharing: boolean
}

type BoolSetting = 'budgetRollover' | 'budgetAlerts' | 'emailNotifs' | 'pushNotifs' | 'goalReminders' | 'weeklyReport' | 'twoFactor' | 'dataSharing'

// Mock Data
const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 1, icon: '⚠️', iconBg: 'rgba(239,68,68,0.1)',   title: 'Budget Alert',       desc: 'Dining out is at 87% of your monthly budget.',         time: '2m ago',     unread: true,  type: 'alert'  },
  { id: 2, icon: '💡', iconBg: 'rgba(0,212,170,0.1)',   title: 'AI Tip',             desc: 'You could save $142/mo by switching your phone plan.', time: '1h ago',     unread: true,  type: 'tip'    },
  { id: 3, icon: '✅', iconBg: 'rgba(0,212,170,0.1)',   title: 'Goal Milestone',     desc: 'Emergency fund just hit 50% — great progress!',        time: '3h ago',     unread: true,  type: 'action' },
  { id: 4, icon: '💳', iconBg: 'rgba(69,123,157,0.1)',  title: 'Large Transaction',  desc: 'A charge of $348.00 was detected at Best Buy.',        time: 'Yesterday',  unread: false, type: 'alert'  },
  { id: 5, icon: '📈', iconBg: 'rgba(69,123,157,0.1)',  title: 'Investment Update',  desc: 'Your portfolio is up 2.4% this week.',                 time: '2 days ago', unread: false, type: 'update' },
  { id: 6, icon: '🔁', iconBg: 'rgba(245,158,11,0.1)',  title: 'Bill Due Soon',      desc: 'Your electric bill (~$95) is due in 3 days.',          time: '2 days ago', unread: false, type: 'alert'  },
]

const MOCK_TRANSACTIONS = [
  { id: 1, name: 'Whole Foods Market', category: 'Groceries',     date: 'Feb 22', amount: -127.43, icon: '🛒', iconBg: 'rgba(0,212,170,0.1)'   },
  { id: 2, name: 'Direct Deposit',     category: 'Income',        date: 'Feb 21', amount: 3250.00, icon: '💰', iconBg: 'rgba(0,168,132,0.1)'   },
  { id: 3, name: 'Netflix',            category: 'Subscriptions', date: 'Feb 20', amount: -15.99,  icon: '📱', iconBg: 'rgba(69,123,157,0.1)'  },
  { id: 4, name: 'Shell Gas Station',  category: 'Transport',     date: 'Feb 20', amount: -58.20,  icon: '⛽', iconBg: 'rgba(245,158,11,0.1)'  },
  { id: 5, name: 'Chipotle',           category: 'Dining',        date: 'Feb 19', amount: -14.75,  icon: '🌯', iconBg: 'rgba(239,68,68,0.1)'   },
  { id: 6, name: 'Amazon',             category: 'Shopping',      date: 'Feb 18', amount: -89.99,  icon: '📦', iconBg: 'rgba(69,123,157,0.1)'  },
  { id: 7, name: 'Spotify',            category: 'Subscriptions', date: 'Feb 17', amount: -9.99,   icon: '🎵', iconBg: 'rgba(69,123,157,0.1)'  },
  { id: 8, name: 'Freelance Payment',  category: 'Income',        date: 'Feb 15', amount: 750.00,  icon: '💼', iconBg: 'rgba(0,168,132,0.1)'   },
]

const MOCK_BUDGET = [
  { name: 'Housing',       spent: 1450, budget: 1500, color: '#457B9D', icon: '🏠' },
  { name: 'Food',          spent: 387,  budget: 500,  color: '#00D4AA', icon: '🛒' },
  { name: 'Transport',     spent: 220,  budget: 300,  color: '#F59E0B', icon: '🚗' },
  { name: 'Dining Out',    spent: 174,  budget: 200,  color: '#EF4444', icon: '🍽️' },
  { name: 'Shopping',      spent: 245,  budget: 300,  color: '#8B5CF6', icon: '🛍️' },
  { name: 'Subscriptions', spent: 55,   budget: 80,   color: '#64748B', icon: '📱' },
]

const MOCK_GOALS = [
  { name: 'Emergency Fund',  target: 15000, saved: 7540, icon: '🛡️', color: '#00D4AA', deadline: 'Dec 2025' },
  { name: 'Europe Trip',     target: 4000,  saved: 1200, icon: '✈️', color: '#457B9D', deadline: 'Aug 2025' },
  { name: 'New MacBook',     target: 2500,  saved: 2500, icon: '💻', color: '#8B5CF6', deadline: 'Completed' },
  { name: 'House Down Pymt', target: 50000, saved: 8000, icon: '🏡', color: '#F59E0B', deadline: 'Dec 2027' },
]

const MOCK_DEBTS = [
  { name: 'Chase Sapphire', balance: 3240,  rate: 22.9, minimum: 65,  type: 'Credit Card',  icon: '💳', severity: 'high' },
  { name: 'Student Loan',   balance: 18500, rate: 5.4,  minimum: 210, type: 'Student Loan', icon: '🎓', severity: 'low'  },
  { name: 'Auto Loan',      balance: 9800,  rate: 7.9,  minimum: 280, type: 'Auto Loan',    icon: '🚗', severity: 'low'  },
]

const MOCK_AGENT_ACTIONS = [
  { title: 'Identified subscription savings', desc: 'Found 3 unused subscriptions totaling $47/mo that could be cancelled.',  time: '2 hours ago', status: 'review',    icon: '🤖', iconBg: 'rgba(0,212,170,0.1)'   },
  { title: 'Rounded up spare change',         desc: 'Transferred $23.47 in round-ups to your emergency fund.',               time: '1 day ago',   status: 'completed', icon: '🪙', iconBg: 'rgba(69,123,157,0.1)'  },
  { title: 'Detected irregular charge',       desc: 'Flagged a $12.99 charge from an unknown merchant for your review.',     time: '2 days ago',  status: 'pending',   icon: '🔍', iconBg: 'rgba(239,68,68,0.1)'   },
  { title: 'Rebalanced budget categories',    desc: 'Shifted $50 from Shopping to Groceries based on spending patterns.',    time: '5 days ago',  status: 'completed', icon: '⚖️', iconBg: 'rgba(245,158,11,0.1)'  },
]

// Sidebar Nav Config 
const NAV_ITEMS: { id: PageId; label: string; icon: string }[] = [
  { id: 'overview',     label: 'Overview',     icon: '📊' },
  { id: 'transactions', label: 'Transactions', icon: '💳' },
  { id: 'budget',       label: 'Budget',       icon: '📋' },
  { id: 'investments',  label: 'Investments',  icon: '📈' },
  { id: 'goals',        label: 'Goals',        icon: '🎯' },
  { id: 'debts',        label: 'Debts',        icon: '💰' },
  { id: 'reports',      label: 'Reports',      icon: '📑' },
]

const PAGE_TITLES: Record<PageId, { title: string; subtitle: string }> = {
  overview:      { title: 'Dashboard',     subtitle: 'Your financial overview'    },
  transactions:  { title: 'Transactions',  subtitle: 'All account activity'       },
  budget:        { title: 'Budget',        subtitle: 'Monthly spending plan'      },
  investments:   { title: 'Investments',   subtitle: 'Portfolio & accounts'       },
  goals:         { title: 'Goals',         subtitle: 'Savings progress'           },
  debts:         { title: 'Debts',         subtitle: 'Payoff tracking'            },
  reports:       { title: 'Reports',       subtitle: 'Insights & analytics'       },
  notifications: { title: 'Notifications', subtitle: 'Alerts & updates'           },
  profile:       { title: 'Profile',       subtitle: 'Account & preferences'      },
  settings:      { title: 'Settings',      subtitle: 'App configuration'          },
}

// Shared Helper Components
const StatCard = ({ label, value, change, positive, icon, iconBg }: {
  label: string; value: string; change: string; positive: boolean; icon: string; iconBg: string
}) => (
  <div className="stat-card">
    <div className="stat-icon" style={{ background: iconBg }}>{icon}</div>
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
    <div className={`stat-change ${positive ? 'positive' : 'negative'}`}>
      {positive ? '↑' : '↓'} {change}
    </div>
  </div>
)

const Toggle = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
  <button className={`toggle-switch ${on ? 'on' : ''}`} onClick={onToggle} />
)

// Overview Page
const OverviewPage = ({ goTo }: { goTo: (p: PageId) => void }) => (
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
        { label: 'Total Balance',    value: '$24,840', change: '3.2% this month',    positive: true,  icon: '🏦', iconBg: 'rgba(0,212,170,0.1)'  },
        { label: 'Monthly Income',   value: '$4,000',  change: '$750 freelance',      positive: true,  icon: '💰', iconBg: 'rgba(69,123,157,0.1)' },
        { label: 'Monthly Expenses', value: '$2,614',  change: '8.1% vs last month',  positive: false, icon: '💸', iconBg: 'rgba(239,68,68,0.1)'  },
        { label: 'Savings Rate',     value: '34.6%',   change: '2.1% improvement',    positive: true,  icon: '📈', iconBg: 'rgba(245,158,11,0.1)' },
      ].map(s => (
        <Grid item xs={12} sm={6} lg={3} key={s.label}>
          <StatCard {...s} />
        </Grid>
      ))}
    </Grid>

    <Grid container spacing={3}>
      {/* Agent Actions */}
      <Grid item xs={12} lg={8}>
        <div className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="section-card-title">🤖 AI Agent Actions</div>
            <button className="btn-outline" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => goTo('reports')}>View All</button>
          </div>
          {MOCK_AGENT_ACTIONS.map((a, i) => (
            <div key={i} className="agent-action-item">
              <div className="agent-action-icon" style={{ background: a.iconBg }}>{a.icon}</div>
              <div style={{ flex: 1 }}>
                <div className="agent-action-title">{a.title}</div>
                <div className="agent-action-desc">{a.desc}</div>
                <div className="agent-action-time">{a.time}</div>
              </div>
              <div className="agent-action-status">
                <span className={`status-badge ${a.status}`}>
                  {a.status === 'completed' ? '✓ Done' : a.status === 'pending' ? '⏳ Pending' : '👁 Review'}
                </span>
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

// ── Transactions Page ─────────────────────────────────────
const TransactionsPage = () => {
  const [filter, setFilter] = useState('All')
  const filters = ['All', 'Income', 'Expenses', 'Groceries', 'Dining', 'Transport', 'Subscriptions']
  const filtered = (() => {
    if (filter === 'All')      return MOCK_TRANSACTIONS
    if (filter === 'Income')   return MOCK_TRANSACTIONS.filter(t => t.amount > 0)
    if (filter === 'Expenses') return MOCK_TRANSACTIONS.filter(t => t.amount < 0)
    return MOCK_TRANSACTIONS.filter(t => t.category.toLowerCase().includes(filter.toLowerCase()))
  })()

  return (
    <div>
      <div className="inner-page-header">
        <div>
          <div className="page-title">Transactions</div>
          <div className="page-subtitle">All account activity · February 2025</div>
        </div>
        <div className="inner-page-actions">
          <button className="btn-outline">↓ Export</button>
          <button className="btn-primary">+ Add Manual</button>
        </div>
      </div>

      <div className="filter-row">
        {filters.map(f => (
          <button key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Merchant</th>
              <th>Category</th>
              <th>Date</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="transaction-icon" style={{ background: t.iconBg, width: 30, height: 30, fontSize: 14 }}>{t.icon}</div>
                    <span style={{ fontWeight: 600 }}>{t.name}</span>
                  </div>
                </td>
                <td>
                  <span style={{ background: '#F1F5F9', padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#64748B' }}>
                    {t.category}
                  </span>
                </td>
                <td style={{ color: '#94A3B8' }}>{t.date}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`transaction-amount ${t.amount > 0 ? 'credit' : 'debit'}`}>
                    {t.amount > 0 ? '+' : ''}${Math.abs(t.amount).toFixed(2)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Budget Page ───────────────────────────────────────────
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
          { label: 'Total Budgeted', value: `$${totalBudget.toLocaleString()}`,                          color: '#457B9D' },
          { label: 'Total Spent',    value: `$${totalSpent.toLocaleString()}`,                           color: '#0A2540' },
          { label: 'Remaining',      value: `$${(totalBudget - totalSpent).toLocaleString()}`,           color: '#00A884' },
          { label: 'On Track',       value: `${MOCK_BUDGET.filter(b => b.spent / b.budget < 0.9).length}/${MOCK_BUDGET.length} categories`, color: '#457B9D' },
        ].map(s => (
          <Grid item xs={6} lg={3} key={s.label}>
            <div className="stat-card" style={{ padding: 16 }}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize: 20, color: s.color }}>{s.value}</div>
            </div>
          </Grid>
        ))}
      </Grid>

      <div className="section-card">
        {MOCK_BUDGET.map(b => {
          const pct = Math.round(b.spent / b.budget * 100)
          const over = pct > 90
          return (
            <div key={b.name} style={{ marginBottom: 22 }}>
              <div className="budget-row-header" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0A2540' }}>{b.icon} {b.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {over && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', background: 'rgba(239,68,68,0.08)', padding: '2px 8px', borderRadius: 10 }}>
                      ⚠ Near limit
                    </span>
                  )}
                  <span className="budget-cat-amounts" style={{ fontSize: 13 }}>
                    ${b.spent} / ${b.budget}{' '}
                    <span style={{ color: over ? '#EF4444' : '#00A884', fontWeight: 700 }}>({pct}%)</span>
                  </span>
                </div>
              </div>
              <div className="budget-bar-track" style={{ height: 9 }}>
                <div className="budget-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: over ? '#EF4444' : b.color }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Investments Page ──────────────────────────────────────
const InvestmentsPage = () => (
  <div>
    <div className="inner-page-header">
      <div>
        <div className="page-title">Investments</div>
        <div className="page-subtitle">Portfolio overview · All accounts</div>
      </div>
      <button className="btn-outline">↓ Statement</button>
    </div>

    <Grid container spacing={2} sx={{ mb: 3 }}>
      {[
        { label: 'Portfolio Value', value: '$31,480', change: '+$742 today',          positive: true },
        { label: 'Total Return',    value: '+18.4%',  change: '+$4,920 all time',     positive: true },
        { label: '401(k)',          value: '$22,100', change: '8% contribution',       positive: true },
        { label: 'Roth IRA',        value: '$9,380',  change: '$583/mo contribution',  positive: true },
      ].map(s => (
        <Grid item xs={6} lg={3} key={s.label}>
          <div className="stat-card" style={{ padding: 16 }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{s.value}</div>
            <div className="stat-change positive">{s.change}</div>
          </div>
        </Grid>
      ))}
    </Grid>

    <Grid container spacing={3}>
      <Grid item xs={12} lg={5}>
        <div className="section-card">
          <div className="section-card-title">Asset Allocation</div>
          <div className="chart-placeholder" style={{ height: 170, marginBottom: 16 }}>📊 Allocation chart coming soon</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {[
              { label: 'US Stocks',    pct: 55, color: '#0A2540' },
              { label: 'Intl Stocks',  pct: 20, color: '#457B9D' },
              { label: 'Bonds',        pct: 15, color: '#00D4AA' },
              { label: 'Cash',         pct: 10, color: '#94A3B8' },
            ].map(a => (
              <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#334155', flex: 1 }}>{a.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0A2540' }}>{a.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </Grid>
      <Grid item xs={12} lg={7}>
        <div className="section-card">
          <div className="section-card-title">Holdings</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Account</th>
                <th style={{ textAlign: 'right' }}>Value</th>
                <th style={{ textAlign: 'right' }}>Return</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'Total Market Index', acct: '401(k)',    value: '$14,200', ret: '+22.1%' },
                { name: 'S&P 500 Fund',       acct: '401(k)',    value: '$7,900',  ret: '+18.4%' },
                { name: 'Target Date 2055',   acct: 'Roth IRA',  value: '$9,380',  ret: '+12.8%' },
                { name: 'Bond Index',         acct: '401(k)',    value: '$4,720',  ret: '+3.2%'  },
                { name: 'Money Market',       acct: 'Brokerage', value: '$2,150',  ret: '+5.1%'  },
              ].map((h, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{h.name}</td>
                  <td>
                    <span style={{ background: '#F1F5F9', padding: '3px 8px', borderRadius: 6, fontSize: 12, color: '#64748B', fontWeight: 600 }}>
                      {h.acct}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{h.value}</td>
                  <td style={{ textAlign: 'right', color: '#00A884', fontWeight: 700 }}>{h.ret}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Grid>
    </Grid>
  </div>
)

// ── Goals Page ────────────────────────────────────────────
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

// ── Debts Page ────────────────────────────────────────────
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
        💡 <strong>AI Recommendation:</strong> Focus on your Chase Sapphire card first — the avalanche method saves ~$840 in interest compared to the snowball method.
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

// ── Reports Page ──────────────────────────────────────────
const ReportsPage = () => (
  <div>
    <div className="inner-page-header">
      <div>
        <div className="page-title">Reports</div>
        <div className="page-subtitle">Financial insights & summaries</div>
      </div>
      <div className="inner-page-actions">
        <button className="btn-outline">↓ Export PDF</button>
        <button className="btn-primary">📧 Email Report</button>
      </div>
    </div>

    <Grid container spacing={3}>
      {[
        { title: 'Monthly Spending Trend', sub: '6-month comparison',  h: 200 },
        { title: 'Income vs. Expenses',    sub: 'Year-to-date',        h: 200 },
        { title: 'Net Worth Growth',       sub: '12-month history',    h: 160 },
        { title: 'Category Breakdown',     sub: 'February 2025',       h: 160 },
      ].map(r => (
        <Grid item xs={12} lg={6} key={r.title}>
          <div className="section-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div className="section-card-title" style={{ marginBottom: 2 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>{r.sub}</div>
              </div>
              <button className="btn-outline" style={{ padding: '5px 12px', fontSize: 12 }}>View</button>
            </div>
            <div className="chart-placeholder" style={{ height: r.h }}>📊 {r.title}</div>
          </div>
        </Grid>
      ))}
    </Grid>
  </div>
)

// ── Notifications Full Page ───────────────────────────────
const NotificationsPage = ({ notifications, markAll, markOne }: {
  notifications: Notification[]
  markAll: () => void
  markOne: (id: number) => void
}) => {
  const [filter, setFilter] = useState('All')
  const filtered = filter === 'All' ? notifications
    : notifications.filter(n => {
        if (filter === 'Alerts')  return n.type === 'alert'
        if (filter === 'Tips')    return n.type === 'tip'
        if (filter === 'Updates') return n.type === 'update' || n.type === 'action'
        return true
      })

  return (
    <div>
      <div className="inner-page-header">
        <div>
          <div className="page-title">Notifications</div>
          <div className="page-subtitle">{notifications.filter(n => n.unread).length} unread</div>
        </div>
        <button className="btn-outline" onClick={markAll}>Mark all as read</button>
      </div>

      <div className="filter-row">
        {['All', 'Alerts', 'Tips', 'Updates'].map(t => (
          <button key={t} className={`filter-chip ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>{t}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {filtered.map(n => (
          <div key={n.id} className={`notif-page-item ${n.unread ? 'unread' : ''}`} onClick={() => markOne(n.id)}>
            <div className="notif-item-icon" style={{ background: n.iconBg }}>{n.icon}</div>
            <div className="notif-item-body">
              <div className="notif-item-title">{n.title}</div>
              <div className="notif-item-desc">{n.desc}</div>
              <div className="notif-item-time" style={{ marginTop: 5 }}>{n.time}</div>
            </div>
            {n.unread && <div className="notif-unread-dot" style={{ marginTop: 4 }} />}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Profile Page ──────────────────────────────────────────
const ProfilePage = () => {
  const [editing, setEditing] = useState<string | null>(null)
  const [info, setInfo] = useState({
    firstName: 'Alex',
    lastName:  'Johnson',
    email:     'alex.johnson@email.com',
    phone:     '+1 (555) 012-3456',
  })

  return (
    <div>
      <div className="page-title" style={{ marginBottom: 3 }}>Profile</div>
      <div className="page-subtitle">Manage your personal information and financial preferences</div>

      {/* Avatar & Name */}
      <div className="profile-avatar-section">
        <div className="profile-avatar-large">
          {info.firstName[0]}{info.lastName[0]}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 19, color: '#0A2540' }}>{info.firstName} {info.lastName}</div>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{info.email}</div>
          <button className="btn-outline" style={{ marginTop: 10, padding: '6px 14px', fontSize: 12 }}>Change Photo</button>
        </div>
      </div>

      {/* Personal Info */}
      <div className="profile-field-group">
        <div className="profile-field-header">Personal Information</div>
        {([
          { label: 'First Name', field: 'firstName' as const },
          { label: 'Last Name',  field: 'lastName'  as const },
          { label: 'Email',      field: 'email'     as const },
          { label: 'Phone',      field: 'phone'     as const },
        ]).map(r => (
          <div key={r.field} className="profile-field-row">
            <span className="profile-field-label">{r.label}</span>
            {editing === r.field ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="profile-inline-input"
                  value={info[r.field]}
                  onChange={e => setInfo(p => ({ ...p, [r.field]: e.target.value }))}
                />
                <button className="btn-primary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setEditing(null)}>Save</button>
                <button className="btn-outline" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setEditing(null)}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="profile-field-value">{info[r.field]}</span>
                <button className="profile-edit-btn" onClick={() => setEditing(r.field)}>Edit</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Household */}
      <div className="profile-field-group">
        <div className="profile-field-header">Household & Lifestyle</div>
        {[
          { label: 'Household',  value: 'Me + partner / spouse' },
          { label: 'Dependents', value: 'No dependents'         },
          { label: 'Housing',    value: 'I rent'                },
          { label: 'Transport',  value: 'Car, Public transit'   },
        ].map(r => (
          <div key={r.label} className="profile-field-row">
            <span className="profile-field-label">{r.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="profile-field-value">{r.value}</span>
              <button className="profile-edit-btn">Edit</button>
            </div>
          </div>
        ))}
      </div>

      {/* Financial Goals */}
      <div className="profile-field-group">
        <div className="profile-field-header">Financial Goals</div>
        <div style={{ padding: '14px 20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {['Emergency Fund', 'Invest for Retirement', 'Save for Europe Trip'].map(g => (
              <span key={g} style={{ background: 'rgba(0,212,170,0.09)', color: '#00A884', fontSize: 13, fontWeight: 600, padding: '5px 13px', borderRadius: 20 }}>
                {g}
              </span>
            ))}
          </div>
          <button className="btn-outline" style={{ fontSize: 12, padding: '6px 14px' }}>Edit Goals →</button>
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="profile-field-group">
        <div className="profile-field-header">Connected Accounts</div>
        <div className="profile-field-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: '#117ACA', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 800 }}>
              CHASE
            </div>
            <div>
              <div className="profile-field-value" style={{ fontSize: 13 }}>Chase Primary Checking</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>Connected · Last synced 2 hours ago</div>
            </div>
          </div>
          <button className="profile-edit-btn">Manage</button>
        </div>
        <div className="profile-field-row">
          <span className="profile-field-label">Link another account</span>
          <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 12 }}>+ Connect Bank</button>
        </div>
      </div>
    </div>
  )
}

// ── Settings Page ─────────────────────────────────────────
const SettingsPage = () => {
  const [s, setS] = useState<SettingsState>({
    theme: 'light', currency: 'USD', dateFormat: 'MM/DD/YYYY',
    budgetPeriod: 'monthly', budgetRollover: false, budgetAlerts: true,
    emailNotifs: true, pushNotifs: true, goalReminders: true,
    weeklyReport: false, twoFactor: false, dataSharing: false,
  })

  const tog = (k: BoolSetting) => setS(p => ({ ...p, [k]: !p[k] }))

  return (
    <div>
      <div className="page-title" style={{ marginBottom: 3 }}>Settings</div>
      <div className="page-subtitle">Customize your FinanceAI experience</div>

      {/* Appearance */}
      <div className="settings-group">
        <div className="settings-group-header">🎨 Appearance</div>
        {([
          { label: 'Theme',       desc: 'Choose your preferred color scheme',        key: 'theme',      opts: [['light','Light'],['dark','Dark'],['system','System']] },
          { label: 'Currency',    desc: 'Display currency for all amounts',           key: 'currency',   opts: [['USD','USD ($)'],['EUR','EUR (€)'],['GBP','GBP (£)']] },
          { label: 'Date Format', desc: 'How dates are shown throughout the app',     key: 'dateFormat', opts: [['MM/DD/YYYY','MM/DD/YYYY'],['DD/MM/YYYY','DD/MM/YYYY'],['YYYY-MM-DD','YYYY-MM-DD']] },
        ] as { label: string; desc: string; key: 'theme' | 'currency' | 'dateFormat'; opts: [string,string][] }[]).map(r => (
          <div key={r.key} className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">{r.label}</div>
              <div className="settings-row-desc">{r.desc}</div>
            </div>
            <select className="settings-select" value={s[r.key]} onChange={e => setS(p => ({ ...p, [r.key]: e.target.value }))}>
              {r.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Budget */}
      <div className="settings-group">
        <div className="settings-group-header">💰 Budget Preferences</div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Budget Period</div>
            <div className="settings-row-desc">How your budget resets each cycle</div>
          </div>
          <select className="settings-select" value={s.budgetPeriod} onChange={e => setS(p => ({ ...p, budgetPeriod: e.target.value as SettingsState['budgetPeriod'] }))}>
            <option value="monthly">Monthly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Budget Rollover</div>
            <div className="settings-row-desc">Carry unspent amounts to the next period</div>
          </div>
          <Toggle on={s.budgetRollover} onToggle={() => tog('budgetRollover')} />
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Spending Alerts</div>
            <div className="settings-row-desc">Alert when a category hits 80% of its budget</div>
          </div>
          <Toggle on={s.budgetAlerts} onToggle={() => tog('budgetAlerts')} />
        </div>
      </div>

      {/* Notifications */}
      <div className="settings-group">
        <div className="settings-group-header">🔔 Notifications</div>
        {([
          { key: 'emailNotifs',   label: 'Email Notifications',  desc: 'Receive alerts and summaries via email'           },
          { key: 'pushNotifs',    label: 'Push Notifications',   desc: 'Browser notifications for real-time alerts'       },
          { key: 'goalReminders', label: 'Goal Reminders',       desc: 'Monthly reminders to contribute to savings goals' },
          { key: 'weeklyReport',  label: 'Weekly Summary',       desc: 'Get a weekly digest of your finances every Monday' },
        ] as { key: BoolSetting; label: string; desc: string }[]).map(r => (
          <div key={r.key} className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">{r.label}</div>
              <div className="settings-row-desc">{r.desc}</div>
            </div>
            <Toggle on={s[r.key] as boolean} onToggle={() => tog(r.key)} />
          </div>
        ))}
      </div>

      {/* Security */}
      <div className="settings-group">
        <div className="settings-group-header">🔐 Privacy & Security</div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Two-Factor Authentication</div>
            <div className="settings-row-desc">Require a code when signing in from a new device</div>
          </div>
          <Toggle on={s.twoFactor} onToggle={() => tog('twoFactor')} />
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Anonymous Analytics</div>
            <div className="settings-row-desc">Share usage data to help improve FinanceAI</div>
          </div>
          <Toggle on={s.dataSharing} onToggle={() => tog('dataSharing')} />
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Change Password</div>
            <div className="settings-row-desc">Update your account password</div>
          </div>
          <button className="btn-outline" style={{ padding: '6px 14px', fontSize: 12 }}>Update →</button>
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="settings-group">
        <div className="settings-group-header">🏦 Connected Accounts</div>
        <div className="settings-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 36, height: 36, background: '#117ACA', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
              CHASE
            </div>
            <div className="settings-row-info">
              <div className="settings-row-label">Chase Primary Checking</div>
              <div className="settings-row-desc">Connected · Last synced 2 hours ago</div>
            </div>
          </div>
          <button className="btn-outline" style={{ padding: '6px 14px', fontSize: 12 }}>Disconnect</button>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Add New Account</div>
            <div className="settings-row-desc">Connect another bank or investment account via Plaid</div>
          </div>
          <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 12 }}>+ Connect</button>
        </div>
      </div>

      {/* Data Management */}
      <div className="settings-group">
        <div className="settings-group-header">📦 Data Management</div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Export My Data</div>
            <div className="settings-row-desc">Download all your financial data as a CSV file</div>
          </div>
          <button className="btn-outline" style={{ padding: '6px 14px', fontSize: 12 }}>↓ Export</button>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label" style={{ color: '#EF4444' }}>Delete Account</div>
            <div className="settings-row-desc">Permanently remove your account and all data</div>
          </div>
          <button style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, border: '1.5px solid #EF4444', color: '#EF4444', background: '#fff', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Notifications Dropdown Component ─────────────────────
const NotificationsDropdown = ({ notifications, onMarkAll, onMarkOne, onViewAll, onClose }: {
  notifications: Notification[]
  onMarkAll: () => void
  onMarkOne: (id: number) => void
  onViewAll: () => void
  onClose: () => void
}) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className="notif-dropdown" ref={ref}>
      <div className="notif-dropdown-header">
        <span className="notif-dropdown-title">
          Notifications
          {notifications.filter(n => n.unread).length > 0 && (
            <span className="notif-count-badge">{notifications.filter(n => n.unread).length}</span>
          )}
        </span>
        <button className="notif-mark-all" onClick={onMarkAll}>Mark all read</button>
      </div>
      <div className="notif-list">
        {notifications.map(n => (
          <div key={n.id} className={`notif-item ${n.unread ? 'unread' : ''}`} onClick={() => onMarkOne(n.id)}>
            <div className="notif-item-icon" style={{ background: n.iconBg }}>{n.icon}</div>
            <div className="notif-item-body">
              <div className="notif-item-title">{n.title}</div>
              <div className="notif-item-desc">{n.desc}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
              <span className="notif-item-time">{n.time}</span>
              {n.unread && <div className="notif-unread-dot" />}
            </div>
          </div>
        ))}
      </div>
      <div className="notif-dropdown-footer">
        <button className="notif-view-all-btn" onClick={onViewAll}>View all notifications →</button>
      </div>
    </div>
  )
}

// ── Sidebar Component ─────────────────────────────────────
const Sidebar = ({ activePage, setActivePage, collapsed, setCollapsed, onLogout }: {
  activePage: PageId
  setActivePage: (p: PageId) => void
  collapsed: boolean
  setCollapsed: (c: boolean) => void
  onLogout: () => void
}) => (
  <div className={`dashboard-sidebar ${collapsed ? 'collapsed' : ''}`}>
    <div className="sidebar-logo">
      <div className="sidebar-logo-icon" />
      {!collapsed && <span className="sidebar-logo-text">FinanceAI</span>}
      <button
        className="sidebar-collapse-btn"
        style={{ marginLeft: collapsed ? 0 : 'auto' }}
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '›' : '‹'}
      </button>
    </div>

    <div className="sidebar-nav">
      {!collapsed && <div className="sidebar-section-label">Main</div>}
      {NAV_ITEMS.map(item => (
        <div
          key={item.id}
          className={`sidebar-nav-item ${activePage === item.id ? 'active' : ''}`}
          onClick={() => setActivePage(item.id)}
          title={collapsed ? item.label : undefined}
        >
          <span className="sidebar-nav-icon">{item.icon}</span>
          {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
        </div>
      ))}
    </div>

    <div className="sidebar-bottom">
      {!collapsed && <div className="sidebar-section-label">Account</div>}
      {([
        { id: 'profile'  as PageId, icon: '👤', label: 'Profile'  },
        { id: 'settings' as PageId, icon: '⚙️', label: 'Settings' },
      ]).map(item => (
        <div
          key={item.id}
          className={`sidebar-nav-item ${activePage === item.id ? 'active' : ''}`}
          onClick={() => setActivePage(item.id)}
          title={collapsed ? item.label : undefined}
        >
          <span className="sidebar-nav-icon">{item.icon}</span>
          {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
        </div>
      ))}
      <div
        className="sidebar-nav-item"
        onClick={onLogout}
        title={collapsed ? 'Logout' : undefined}
        style={{ color: 'rgba(239,68,68,0.6)' }}
      >
        <span className="sidebar-nav-icon">🚪</span>
        {!collapsed && <span className="sidebar-nav-label">Logout</span>}
      </div>
    </div>
  </div>
)

// ── Dashboard Root Component ──────────────────────────────
function Dashboard() {
  const navigate = useNavigate()
  const [activePage,    setActivePage]    = useState<PageId>('overview')
  const [collapsed,     setCollapsed]     = useState(false)
  const [notifOpen,     setNotifOpen]     = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS)

  const unreadCount = notifications.filter(n => n.unread).length

  useEffect(() => {
    const verifyAuth = async () => {
      const token = getToken()
      if (!token) { navigate('/login'); return }
      try {
        const res = await fetch(`${API_BASE}/verify`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) { clearToken(); navigate('/login') }
      } catch {
        navigate('/login')
      }
    }
    verifyAuth()
  }, [navigate])

  const handleLogout = () => { clearToken(); navigate('/login') }
  const markAll  = () => setNotifications(n => n.map(x => ({ ...x, unread: false })))
  const markOne  = (id: number) => setNotifications(n => n.map(x => x.id === id ? { ...x, unread: false } : x))

  const goTo = (page: PageId) => {
    setActivePage(page)
    setNotifOpen(false)
  }

  const { title, subtitle } = PAGE_TITLES[activePage]

  const renderPage = () => {
    switch (activePage) {
      case 'overview':      return <OverviewPage goTo={goTo} />
      case 'transactions':  return <TransactionsPage />
      case 'budget':        return <BudgetPage />
      case 'investments':   return <InvestmentsPage />
      case 'goals':         return <GoalsPage />
      case 'debts':         return <DebtsPage />
      case 'reports':       return <ReportsPage />
      case 'notifications': return <NotificationsPage notifications={notifications} markAll={markAll} markOne={markOne} />
      case 'profile':       return <ProfilePage />
      case 'settings':      return <SettingsPage />
    }
  }

  return (
    <div className="dashboard-root">
      <Sidebar
        activePage={activePage}
        setActivePage={goTo}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        onLogout={handleLogout}
      />

      <div className={`dashboard-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Sticky Header */}
        <div className="dashboard-header">
          <div>
            <div className="dashboard-header-title">{title}</div>
            <div className="dashboard-header-subtitle">{subtitle}</div>
          </div>

          <div className="header-actions">
            {/* Notifications Bell */}
            <div className="notif-wrapper">
              <button
                className={`header-icon-btn ${notifOpen ? 'active' : ''}`}
                onClick={() => setNotifOpen(o => !o)}
                title="Notifications"
              >
                🔔
                {unreadCount > 0 && <div className="notif-badge" />}
              </button>
              {notifOpen && (
                <NotificationsDropdown
                  notifications={notifications}
                  onMarkAll={markAll}
                  onMarkOne={markOne}
                  onViewAll={() => goTo('notifications')}
                  onClose={() => setNotifOpen(false)}
                />
              )}
            </div>

            <button className="header-icon-btn" onClick={() => goTo('settings')} title="Settings">⚙️</button>

            {/* Profile Avatar */}
            <div
              className="header-avatar"
              onClick={() => goTo('profile')}
              title="Profile"
            >
              AJ
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="dashboard-page">
          {renderPage()}
        </div>
      </div>
    </div>
  )
}

export default Dashboard