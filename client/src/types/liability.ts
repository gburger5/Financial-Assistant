export interface Apr {
  aprPercentage: number
  aprType: string
  balanceSubjectToApr: number | null
  interestChargeAmount: number | null
}

export interface CreditDetails {
  minimumPaymentAmount: number | null
  nextPaymentDueDate: string | null
  lastPaymentAmount: number | null
  lastStatementBalance: number | null
  aprs: Apr[]
}

export interface StudentDetails {
  outstandingInterestAmount: number | null
  outstandingPrincipalAmount: number | null
  originationPrincipalAmount: number | null
  interestRatePercentage: number | null
  minimumPaymentAmount: number | null
  servicerAddress: Record<string, string | null> | null
  repaymentPlan: { description: string | null; type: string | null } | null
  sequenceNumber: string | null
}

export interface MortgageDetails {
  outstandingPrincipalBalance: number | null
  interestRatePercentage: number | null
  nextMonthlyPayment: number | null
  originationDate: string | null
  maturityDate: string | null
  propertyAddress: Record<string, string | null> | null
  escrowBalance: number | null
  hasPmi: boolean | null
  hasPrepaymentPenalty: boolean | null
}

export interface CreditLiability {
  userId: string
  sortKey: string
  plaidAccountId: string
  currentBalance: null
  liabilityType: 'credit'
  details: CreditDetails
  createdAt: string
  updatedAt: string
}

export interface StudentLiability {
  userId: string
  sortKey: string
  plaidAccountId: string
  currentBalance: null
  liabilityType: 'student'
  details: StudentDetails
  createdAt: string
  updatedAt: string
}

export interface MortgageLiability {
  userId: string
  sortKey: string
  plaidAccountId: string
  currentBalance: null
  liabilityType: 'mortgage'
  details: MortgageDetails
  createdAt: string
  updatedAt: string
}

export type Liability = CreditLiability | StudentLiability | MortgageLiability
