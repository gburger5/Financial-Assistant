/**
 * @module accounts.types
 * @description Shared type definitions for the Accounts module.
 * Accounts are children of PlaidItems — one bank connection (Item) can
 * have many accounts (checking, savings, credit card, etc.).
 *
 * Accounts table schema:
 *   PK: userId (HASH), SK: plaidAccountId (RANGE)
 *   GSI: itemId-index           — itemId (HASH), plaidAccountId (RANGE)
 *   GSI: plaidAccountId-index   — plaidAccountId (HASH)
 */

export type AccountType =
  | 'depository'
  | 'credit'
  | 'loan'
  | 'investment'
  | 'payroll'
  | 'other';

export type DepositorySubtype =
  | 'cash management'
  | 'cd'
  | 'checking'
  | 'ebt'
  | 'hsa'
  | 'money market'
  | 'paypal'
  | 'prepaid'
  | 'savings';

export type CreditSubtype =
  | 'credit card'
  | 'paypal';

export type LoanSubtype =
  | 'auto'
  | 'business'
  | 'commercial'
  | 'construction'
  | 'consumer'
  | 'home equity'
  | 'line of credit'
  | 'loan'
  | 'mortgage'
  | 'other'
  | 'overdraft'
  | 'student';

export type InvestmentSubtype =
  | '529'
  | '401a'
  | '401k'
  | '403B'
  | '457b'
  | 'brokerage'
  | 'cash isa'
  | 'crypto exchange'
  | 'education savings account'
  | 'fixed annuity'
  | 'gic'
  | 'health reimbursement arrangement'
  | 'hsa'
  | 'ira'
  | 'isa'
  | 'keogh'
  | 'lif'
  | 'life insurance'
  | 'lira'
  | 'lrif'
  | 'lrsp'
  | 'mutual fund'
  | 'non-custodial wallet'
  | 'non-taxable brokerage account'
  | 'other'
  | 'other annuity'
  | 'other insurance'
  | 'pension'
  | 'prif'
  | 'profit sharing plan'
  | 'qshr'
  | 'rdsp'
  | 'resp'
  | 'retirement'
  | 'rlif'
  | 'roth'
  | 'roth 401k'
  | 'rrif'
  | 'rrsp'
  | 'sarsep'
  | 'sep ira'
  | 'simple ira'
  | 'sipp'
  | 'stock plan'
  | 'tfsa'
  | 'thrift savings plan'
  | 'trust'
  | 'ugma'
  | 'utma'
  | 'variable annuity';

export type PayrollSubtype = 'payroll';

export type OtherSubtype = 'other';

export type AccountSubtype =
  | DepositorySubtype
  | CreditSubtype
  | LoanSubtype
  | InvestmentSubtype
  | PayrollSubtype;

export interface Account {
  userId: string;
  plaidAccountId: string;
  itemId: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: AccountType;
  subtype: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  limitBalance: number | null;
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface PlaidAccountData {
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: {
    current: number | null;
    available: number | null;
    limit: number | null;
    iso_currency_code: string | null;
    unofficial_currency_code: string | null;
  };
}
