import './TransactionRow.css'

interface TransactionRowProps {
  name: string
  category: string
  date: string
  amount: number
  merchantIcon?: string
}

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  FOOD_AND_DRINK:       { bg: 'rgba(251, 146, 60, 0.15)',  color: '#fb923c' },
  TRANSPORTATION:       { bg: 'rgba(96, 165, 250, 0.15)',  color: '#60a5fa' },
  BANK_FEES:            { bg: 'rgba(161, 161, 170, 0.15)', color: '#a1a1aa' },
  PERSONAL_CARE:        { bg: 'rgba(232, 121, 249, 0.15)', color: '#e879f9' },
  GENERAL_MERCHANDISE:  { bg: 'rgba(52, 211, 153, 0.15)',  color: '#34d399' },
  TRANSFER_OUT:         { bg: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa' },
  TRANSFER_IN:          { bg: 'rgba(74, 222, 128, 0.15)',  color: '#4ade80' },
  ENTERTAINMENT:        { bg: 'rgba(250, 204, 21, 0.15)',  color: '#facc15' },
  TRAVEL:               { bg: 'rgba(34, 211, 238, 0.15)',  color: '#22d3ee' },
  HEALTHCARE:           { bg: 'rgba(248, 113, 113, 0.15)', color: '#f87171' },
  INCOME:               { bg: 'rgba(74, 222, 128, 0.15)',  color: '#4ade80' },
  RENT_AND_UTILITIES:   { bg: 'rgba(251, 191, 36, 0.15)',  color: '#fbbf24' },
  HOME_IMPROVEMENT:     { bg: 'rgba(251, 191, 36, 0.15)',  color: '#fbbf24' },
  LOAN_PAYMENTS:        { bg: 'rgba(248, 113, 113, 0.15)', color: '#f87171' },
  GOVERNMENT_AND_NON_PROFIT: { bg: 'rgba(129, 140, 248, 0.15)', color: '#818cf8' },
}

function formatCategory(raw: string): string {
  return raw
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function getCategoryStyle(category: string) {
  return CATEGORY_COLORS[category] ?? { bg: 'rgba(161, 161, 170, 0.12)', color: '#a1a1aa' }
}

export default function TransactionRow({ name, category, date, amount, merchantIcon }: TransactionRowProps) {
  // In Plaid: positive amount = money leaving (debit/expense), negative = money arriving (credit/income)
  const isExpense = amount > 0
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(amount))
  const catStyle = getCategoryStyle(category)

  return (
    <div className="transaction-row">
      <div className="transaction-row__icon">
        {merchantIcon ? (
          <img src={merchantIcon} alt={name} className="transaction-row__merchant-img" />
        ) : (
          <span className="transaction-row__icon-letter">{name[0]?.toUpperCase()}</span>
        )}
      </div>
      <div className="transaction-row__info">
        <span className="transaction-row__name">{name}</span>
        <span
          className="transaction-row__category-pill"
          style={{ background: catStyle.bg, color: catStyle.color }}
        >
          {formatCategory(category)}
        </span>
      </div>
      <span className="transaction-row__date">{date}</span>
      <span className={`transaction-row__amount ${isExpense ? 'transaction-row__amount--expense' : 'transaction-row__amount--income'}`}>
        {isExpense ? '-' : '+'}{formatted}
      </span>
    </div>
  )
}
