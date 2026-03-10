export interface DebtAccount {
  account_id: string;
  name: string;
  institution_name: string | null;
  type: "credit_card" | "student_loan" | "mortgage" | "other";
  current_balance: number;
  interest_rate: number | null;
  minimum_payment: number | null;
  next_payment_due_date: string | null;
}

export interface DebtAgentInput {
  userId: string;
  debtAllocation: number;
  debts: DebtAccount[];
}

export interface InvestmentHolding {
  security_name: string;
  ticker_symbol: string | null;
  quantity: number;
  current_value: number;
}

export interface InvestmentAccount {
  account_id: string;
  name: string;
  institution_name: string | null;
  type: "401k" | "ira" | "brokerage" | "other";
  current_balance: number;
  holdings: InvestmentHolding[];
}

export interface InvestingAgentInput {
  userId: string;
  investingAllocation: number;
  accounts: InvestmentAccount[];
  userAge: number | null;
}

/** Debt payment scheduled by the agent, written to Transactions on approval. */
export interface ScheduledPayment {
  plaid_account_id: string;
  amount: number;
  debt_name: string;
  payment_type: "minimum" | "extra" | "payoff";
}

/** Investment contribution scheduled by the agent, written to Transactions on approval. */
export interface ScheduledContribution {
  plaid_account_id: string;
  amount: number;
  account_name: string;
  contribution_type: "401k" | "roth_ira" | "traditional_ira" | "brokerage";
  fund_ticker: string | null;
  fund_name: string | null;
}
