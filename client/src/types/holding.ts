export type SecurityType =
  | 'cash'
  | 'cryptocurrency'
  | 'derivative'
  | 'equity'
  | 'etf'
  | 'fixed income'
  | 'loan'
  | 'mutual fund'
  | 'other'

export interface Holding {
  userId: string
  snapshotDateAccountSecurity: string
  plaidAccountId: string
  securityId: string
  snapshotDate: string
  quantity: number
  institutionPrice: number
  institutionValue: number
  costBasis: number | null
  isoCurrencyCode: string | null
  unofficialCurrencyCode: string | null
  securityName: string | null
  tickerSymbol: string | null
  securityType: SecurityType
  closePrice: number | null
  closePriceAsOf: string | null
  isin: string | null
  cusip: string | null
  createdAt: string
  updatedAt: string
}
