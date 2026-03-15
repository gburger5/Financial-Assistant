export type AccountType = 'depository' | 'credit' | 'loan' | 'investment' | 'payroll' | 'other'

export interface Account {
  userId: string
  plaidAccountId: string
  itemId: string
  name: string
  officialName: string | null
  mask: string | null
  type: AccountType
  subtype: string | null
  currentBalance: number | null
  availableBalance: number | null
  limitBalance: number | null
  isoCurrencyCode: string | null
  unofficialCurrencyCode: string | null
  updatedAt: string
  createdAt: string
}
