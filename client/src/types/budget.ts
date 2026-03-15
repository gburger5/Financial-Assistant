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
  debts: BudgetAmount
  investments: BudgetAmount
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
  debts: BudgetAmount
  investments: BudgetAmount
}>
