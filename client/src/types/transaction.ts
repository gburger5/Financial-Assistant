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
