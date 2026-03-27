export type BudgetGoal =
  | 'pay down debt'
  | 'maximize investments'
  | 'build a strong emergency fund'
  | 'save for big purchase'
  | 'lower overall spending'
  | 'have more fun money'

export const BUDGET_GOALS: BudgetGoal[] = [
  'pay down debt',
  'maximize investments',
  'build a strong emergency fund',
  'save for big purchase',
  'lower overall spending',
  'have more fun money',
]

export interface Budget {
  userId: string
  budgetId: string
  createdAt: string
  income: BudgetAmount
  housing: BudgetAmount
  utilities: BudgetAmount
  transportation: BudgetAmount
  groceries: BudgetAmount
  takeout: BudgetAmount
  shopping: BudgetAmount
  personalCare: BudgetAmount
  emergencyFund: BudgetAmount
  entertainment: BudgetAmount
  medical: BudgetAmount
  debts: BudgetAmount
  investments: BudgetAmount
  goals: BudgetGoal[]
}

export interface BudgetAmount {
  amount: number
}

export type BudgetUpdateInput = Partial<{
  income: BudgetAmount
  housing: BudgetAmount
  utilities: BudgetAmount
  transportation: BudgetAmount
  groceries: BudgetAmount
  shopping: BudgetAmount
  takeout: BudgetAmount
  personalCare: BudgetAmount
  emergencyFund: BudgetAmount
  entertainment: BudgetAmount
  medical: BudgetAmount
  debts: BudgetAmount
  investments: BudgetAmount
  goals: BudgetGoal[]
}>
