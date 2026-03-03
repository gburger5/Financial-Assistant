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

export interface PlaidDebtTransaction {
  type: "payment";
  account_id: string;
  amount: number;
  institution_name: string | null;
  debt_name: string;
  payment_type: "minimum" | "extra" | "payoff";
  scheduled_date: string;
}

export interface PlaidInvestTransaction {
  type: "contribution";
  account_id: string;
  amount: number;
  institution_name: string | null;
  account_name: string;
  fund_ticker: string | null;
  fund_name: string | null;
  contribution_type: "401k" | "roth_ira" | "traditional_ira" | "brokerage";
  scheduled_date: string;
}
