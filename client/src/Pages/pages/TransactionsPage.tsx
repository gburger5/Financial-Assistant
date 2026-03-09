import { useState } from 'react'
import { MOCK_TRANSACTIONS } from '../data/Mockdata'

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

export default TransactionsPage