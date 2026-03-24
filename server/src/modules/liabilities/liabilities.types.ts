/**
 * @module liabilities.types
 * @description Shared TypeScript interfaces and discriminated union types for the Liabilities module.
 * Covers credit cards, student loans, and mortgages — plus the raw Plaid API shapes for each
 * and the sync result envelope returned by updateLiabilities.
 *
 * Design: a discriminated union on liabilityType rather than a flat interface with optional fields.
 * Once narrowed (e.g. liabilityType === 'credit'), TypeScript knows exactly what is in `details`
 * and will error on incorrect field access at compile time. details is nested to keep base fields
 * (userId, plaidAccountId, currentBalance) structurally separate from type-specific fields.
 */

/**
 * @interface Address
 * @description CamelCase postal address shared by student loans (servicerAddress)
 * and mortgages (propertyAddress).
 */
export interface Address {
  city: string | null;
  country: string | null;
  postalCode: string | null;
  region: string | null;
  street: string | null;
}

/**
 * @interface Apr
 * @description A single APR tier on a credit card account.
 */
export interface Apr {
  aprPercentage: number;
  aprType: string;
  balanceSubjectToApr: number | null;
  interestChargeAmount: number | null;
}

/**
 * @interface CreditDetails
 * @description Type-specific fields for credit card liabilities.
 */
export interface CreditDetails {
  minimumPaymentAmount: number | null;
  nextPaymentDueDate: string | null;
  lastPaymentAmount: number | null;
  lastStatementBalance: number | null;
  aprs: Apr[];
}

/**
 * @interface RepaymentPlan
 * @description Student loan repayment plan descriptor.
 */
export interface RepaymentPlan {
  description: string | null;
  type: string | null;
}

/**
 * @interface StudentDetails
 * @description Type-specific fields for student loan liabilities.
 */
export interface StudentDetails {
  outstandingInterestAmount: number | null;
  outstandingPrincipalAmount: number | null;
  originationPrincipalAmount: number | null;
  interestRatePercentage: number | null;
  minimumPaymentAmount: number | null;
  servicerAddress: Address | null;
  repaymentPlan: RepaymentPlan | null;
  sequenceNumber: string | null;
}

/**
 * @interface MortgageDetails
 * @description Type-specific fields for mortgage liabilities.
 */
export interface MortgageDetails {
  outstandingPrincipalBalance: number | null;
  interestRatePercentage: number | null;
  nextMonthlyPayment: number | null;
  originationDate: string | null;
  maturityDate: string | null;
  propertyAddress: Address | null;
  escrowBalance: number | null;
  hasPmi: boolean | null;
  hasPrepaymentPenalty: boolean | null;
}

/**
 * Base fields stored for every liability type in the Liabilities DynamoDB table.
 * currentBalance is always null — balances live in the Accounts table which is
 * populated by syncAccounts from the same liabilitiesGet response.
 *
 * DynamoDB schema:
 *   PK: userId (HASH)
 *   SK: sortKey (RANGE) — format: "plaidAccountId#ULID"
 *
 * Each sync creates a new record (append-only). The ULID suffix sorts
 * chronologically, so the latest snapshot per account is the one with
 * the highest sort key for a given plaidAccountId prefix.
 */
interface BaseLiability {
  userId: string;
  /** Composite sort key: "plaidAccountId#ULID". Enables historical snapshots. */
  sortKey: string;
  /** The Plaid account this liability belongs to. */
  plaidAccountId: string;
  /**
   * Always null — Plaid's liabilities endpoint does not return balances on liability
   * objects. Balances are on account objects in the same response, already upserted
   * via accounts.service.syncAccounts. The Accounts table is the source of truth.
   */
  currentBalance: null;
  createdAt: string;
  updatedAt: string;
}

/**
 * @interface CreditLiability
 * @description Credit card liability. liabilityType discriminant narrows details to CreditDetails.
 */
export interface CreditLiability extends BaseLiability {
  liabilityType: 'credit';
  details: CreditDetails;
}

/**
 * @interface StudentLiability
 * @description Student loan liability. liabilityType discriminant narrows details to StudentDetails.
 */
export interface StudentLiability extends BaseLiability {
  liabilityType: 'student';
  details: StudentDetails;
}

/**
 * @interface MortgageLiability
 * @description Mortgage liability. liabilityType discriminant narrows details to MortgageDetails.
 */
export interface MortgageLiability extends BaseLiability {
  liabilityType: 'mortgage';
  details: MortgageDetails;
}

/**
 * Discriminated union of all liability types. Narrow on liabilityType to access
 * type-specific details fields with full TypeScript safety.
 */
export type Liability = CreditLiability | StudentLiability | MortgageLiability;

// ---------------------------------------------------------------------------
// Plaid raw shapes — the subset of Plaid's response this module actually uses.
// Defining our own shapes insulates the module from SDK version changes.
// ---------------------------------------------------------------------------

/** Raw APR object from Plaid's credit liabilities array. */
export interface PlaidApr {
  apr_percentage: number;
  apr_type: string;
  balance_subject_to_apr: number | null;
  interest_charge_amount: number | null;
}

/** Raw address object shared by student loans and mortgages in Plaid responses. */
export interface PlaidAddress {
  city: string | null;
  country: string | null;
  postal_code: string | null;
  region: string | null;
  street: string | null;
}

/** Raw repayment plan from Plaid's student loan liabilities. */
export interface PlaidRepaymentPlan {
  description: string | null;
  type: string | null;
}

/** Raw credit card liability from Plaid's liabilitiesGet response. */
export interface PlaidCreditLiability {
  account_id: string;
  aprs: PlaidApr[];
  minimum_payment_amount: number | null;
  next_payment_due_date: string | null;
  last_payment_amount: number | null;
  last_statement_balance: number | null;
}

/** Raw student loan liability from Plaid's liabilitiesGet response. */
export interface PlaidStudentLoan {
  account_id: string;
  outstanding_interest_amount: number | null;
  outstanding_principal_amount: number | null;
  origination_principal_amount: number | null;
  interest_rate_percentage: number | null;
  minimum_payment_amount: number | null;
  servicer_address: PlaidAddress | null;
  repayment_plan: PlaidRepaymentPlan | null;
  sequence_number: string | null;
}

/** Raw mortgage liability from Plaid's liabilitiesGet response. */
export interface PlaidMortgage {
  account_id: string;
  outstanding_principal_balance: number | null;
  /** Plaid nests interest rate: { percentage, type }. */
  interest_rate: { percentage: number | null; type: string | null } | null;
  next_monthly_payment: number | null;
  origination_date: string | null;
  maturity_date: string | null;
  property_address: PlaidAddress | null;
  escrow_balance: number | null;
  has_pmi: boolean | null;
  has_prepayment_penalty: boolean | null;
}

/**
 * @interface LiabilitySyncResult
 * @description Result envelope returned by updateLiabilities.
 * Separate counts per type because different liability types have different
 * expected volumes and drive different downstream analyses.
 */
export interface LiabilitySyncResult {
  creditCount: number;
  studentCount: number;
  mortgageCount: number;
}
