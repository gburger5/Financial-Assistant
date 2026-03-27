export interface Transaction {
  userId: string
  sortKey: string
  plaidTransactionId: string
  plaidAccountId: string
  amount: number
  date: string
  name: string
  merchantName: string | null
  category: string | null
  detailedCategory: string | null
  categoryIconUrl: string | null
  pending: boolean
  isoCurrencyCode: string | null
  unofficialCurrencyCode: string | null
  createdAt: string
  updatedAt: string
}

export interface InvestmentTransaction {
  userId: string
  dateTransactionId: string
  investmentTransactionId: string
  plaidAccountId: string
  securityId: string
  date: string
  name: string
  quantity: number
  amount: number
  price: number
  fees: number | null
  type: 'buy' | 'sell' | 'dividend' | 'transfer' | 'cash' | 'fee'
  subtype: string | null
  isoCurrencyCode: string | null
  unofficialCurrencyCode: string | null
  createdAt: string
  updatedAt: string
}
