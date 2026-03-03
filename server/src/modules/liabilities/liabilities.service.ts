/**
 * @module liabilities.service
 * @description Business logic layer for the Liabilities module.
 * All other modules import from here — never from the repository directly.
 *
 * Unlike transactions (append-only) and holdings (accumulating snapshots),
 * liabilities are a current-state overwrite model. What matters for financial
 * planning is what you owe right now: minimum payments, interest rates, balances.
 * Each sync replaces the previous record entirely via upsertSnapshot (PutCommand).
 *
 * This module has no HTTP routes — internal only.
 */
import { plaidClient } from '../../lib/plaidClient.js';
import { createLogger } from '../../lib/logger.js';
import { getItemForSync } from '../items/items.service.js';
import { syncAccounts } from '../accounts/accounts.service.js';
import { upsertSnapshot, getByUserId } from './liabilities.repository.js';
import type { PlaidAccountData } from '../accounts/accounts.types.js';
import type {
  Address,
  Apr,
  CreditLiability,
  StudentLiability,
  MortgageLiability,
  Liability,
  LiabilitySyncResult,
  PlaidAddress,
  PlaidApr,
  PlaidCreditLiability,
  PlaidStudentLoan,
  PlaidMortgage,
} from './liabilities.types.js';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/**
 * Maps a raw Plaid address (snake_case) to our camelCase Address shape.
 * Shared by student loans (servicer_address) and mortgages (property_address)
 * — extracting it avoids duplicating identical mapping logic in both functions.
 * Returns null when the input address is null.
 *
 * @param {PlaidAddress | null} address - Raw address from the Plaid response, or null.
 * @returns {Address | null}
 */
export function mapAddress(address: PlaidAddress | null): Address | null {
  if (address === null) return null;

  return {
    city: address.city,
    country: address.country,
    postalCode: address.postal_code,
    region: address.region,
    street: address.street,
  };
}

/**
 * Maps a single raw Plaid APR object to our camelCase Apr shape.
 *
 * @param {PlaidApr} apr - Raw APR from Plaid's credit liabilities array.
 * @returns {Apr}
 */
function mapApr(apr: PlaidApr): Apr {
  return {
    aprPercentage: apr.apr_percentage,
    aprType: apr.apr_type,
    balanceSubjectToApr: apr.balance_subject_to_apr,
    interestChargeAmount: apr.interest_charge_amount,
  };
}

/**
 * Maps a raw Plaid credit card liability to our CreditLiability storage shape.
 * Pure function — no database calls, no side effects.
 *
 * currentBalance is set to null because Plaid's liabilities endpoint does not
 * return balances on liability objects. Balances live on account objects in the
 * same response, upserted via syncAccounts.
 *
 * @param {string} userId - UUID of the user who owns this liability.
 * @param {PlaidCreditLiability} credit - Raw credit card liability from Plaid.
 * @returns {CreditLiability}
 */
export function mapCreditLiability(userId: string, credit: PlaidCreditLiability): CreditLiability {
  const now = new Date().toISOString();

  return {
    userId,
    plaidAccountId: credit.account_id,
    liabilityType: 'credit',
    currentBalance: null,
    details: {
      minimumPaymentAmount: credit.minimum_payment_amount,
      nextPaymentDueDate: credit.next_payment_due_date,
      lastPaymentAmount: credit.last_payment_amount,
      lastStatementBalance: credit.last_statement_balance,
      aprs: credit.aprs.map(mapApr),
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Maps a raw Plaid student loan to our StudentLiability storage shape.
 * Pure function — no database calls, no side effects.
 *
 * servicer_address is passed through mapAddress to normalise the snake_case
 * fields to camelCase. repayment_plan is mapped manually (no shared helper
 * needed since it only appears on student loans).
 *
 * @param {string} userId - UUID of the user who owns this liability.
 * @param {PlaidStudentLoan} loan - Raw student loan from Plaid.
 * @returns {StudentLiability}
 */
export function mapStudentLiability(userId: string, loan: PlaidStudentLoan): StudentLiability {
  const now = new Date().toISOString();

  return {
    userId,
    plaidAccountId: loan.account_id,
    liabilityType: 'student',
    currentBalance: null,
    details: {
      outstandingInterestAmount: loan.outstanding_interest_amount,
      outstandingPrincipalAmount: loan.outstanding_principal_amount,
      originationPrincipalAmount: loan.origination_principal_amount,
      interestRatePercentage: loan.interest_rate_percentage,
      minimumPaymentAmount: loan.minimum_payment_amount,
      servicerAddress: mapAddress(loan.servicer_address),
      repaymentPlan: loan.repayment_plan
        ? { description: loan.repayment_plan.description, type: loan.repayment_plan.type }
        : null,
      sequenceNumber: loan.sequence_number,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Maps a raw Plaid mortgage to our MortgageLiability storage shape.
 * Pure function — no database calls, no side effects.
 *
 * Plaid nests the interest rate as interest_rate: { percentage, type }.
 * We flatten it — interestRatePercentage lives directly on MortgageDetails.
 * property_address is passed through mapAddress.
 *
 * @param {string} userId - UUID of the user who owns this liability.
 * @param {PlaidMortgage} mortgage - Raw mortgage from Plaid.
 * @returns {MortgageLiability}
 */
export function mapMortgageLiability(userId: string, mortgage: PlaidMortgage): MortgageLiability {
  const now = new Date().toISOString();

  return {
    userId,
    plaidAccountId: mortgage.account_id,
    liabilityType: 'mortgage',
    currentBalance: null,
    details: {
      outstandingPrincipalBalance: mortgage.outstanding_principal_balance,
      // Plaid nests the rate as interest_rate: { percentage } — flatten it here.
      interestRatePercentage: mortgage.interest_rate?.percentage ?? null,
      nextMonthlyPayment: mortgage.next_monthly_payment,
      originationDate: mortgage.origination_date,
      maturityDate: mortgage.maturity_date,
      propertyAddress: mapAddress(mortgage.property_address),
      escrowBalance: mortgage.escrow_balance,
      hasPmi: mortgage.has_pmi,
      hasPrepaymentPenalty: mortgage.has_prepayment_penalty,
    },
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Core sync function
// ---------------------------------------------------------------------------

/**
 * Fetches current liabilities for a bank connection and overwrites all records.
 * Makes a single call to liabilitiesGet (no pagination — liabilities returns
 * complete current state in one response). Calls syncAccounts first to upsert
 * balance data from the same response.
 *
 * All three liability type arrays may be null — an item may have credit cards
 * but no student loans. Each is null-checked with `?? []` before mapping.
 *
 * Writes are issued in parallel via Promise.allSettled. Individual failures are
 * logged and do not abort the sync — the next sync will retry since every write
 * is a full overwrite and position in the batch doesn't matter.
 *
 * @param {string} itemId - Plaid item ID of the bank connection to sync.
 * @returns {Promise<LiabilitySyncResult>} Counts of each liability type processed.
 */
export async function updateLiabilities(itemId: string): Promise<LiabilitySyncResult> {
  const item = await getItemForSync(itemId);
  const { userId, accessToken } = item;

  const response = await plaidClient.liabilitiesGet({
    access_token: accessToken,
  });

  // Upsert account balance data from the same response — balances live in Accounts.
  await syncAccounts(userId, itemId, response.data.accounts as PlaidAccountData[]);

  const liabilities = response.data.liabilities as unknown as {
    credit: PlaidCreditLiability[] | null;
    student: PlaidStudentLoan[] | null;
    mortgage: PlaidMortgage[] | null;
  };

  const creditLiabilities = (liabilities.credit ?? []).map((c) => mapCreditLiability(userId, c));
  const studentLiabilities = (liabilities.student ?? []).map((l) => mapStudentLiability(userId, l));
  const mortgageLiabilities = (liabilities.mortgage ?? []).map((m) => mapMortgageLiability(userId, m));

  const allLiabilities: Liability[] = [...creditLiabilities, ...studentLiabilities, ...mortgageLiabilities];

  const results = await Promise.allSettled(allLiabilities.map((l) => upsertSnapshot(l)));

  // Log any failures — the next sync will retry since upsertSnapshot is a full overwrite.
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      logger.error(
        { err: result.reason, liability: allLiabilities[i] },
        'Failed to upsert liability snapshot — will retry on next sync',
      );
    }
  });

  return {
    creditCount: creditLiabilities.length,
    studentCount: studentLiabilities.length,
    mortgageCount: mortgageLiabilities.length,
  };
}

// ---------------------------------------------------------------------------
// Read methods
// ---------------------------------------------------------------------------

/**
 * Returns all liabilities for a user across all types.
 *
 * @param {string} userId - UUID of the user whose liabilities to fetch.
 * @returns {Promise<Liability[]>}
 */
export async function getLiabilitiesForUser(userId: string): Promise<Liability[]> {
  return getByUserId(userId);
}

/**
 * Returns only credit card liabilities for a user.
 * Filters in memory — a user has at most a handful of accounts, making an
 * in-memory filter negligible compared to a GSI on liabilityType.
 * The discriminated union narrows the return type to CreditLiability[].
 *
 * @param {string} userId - UUID of the user whose credit liabilities to fetch.
 * @returns {Promise<CreditLiability[]>}
 */
export async function getCreditLiabilities(userId: string): Promise<CreditLiability[]> {
  const all = await getByUserId(userId);
  return all.filter((l): l is CreditLiability => l.liabilityType === 'credit');
}

/**
 * Returns only student loan liabilities for a user.
 * Filters in memory — same rationale as getCreditLiabilities.
 * The discriminated union narrows the return type to StudentLiability[].
 *
 * @param {string} userId - UUID of the user whose student liabilities to fetch.
 * @returns {Promise<StudentLiability[]>}
 */
export async function getStudentLiabilities(userId: string): Promise<StudentLiability[]> {
  const all = await getByUserId(userId);
  return all.filter((l): l is StudentLiability => l.liabilityType === 'student');
}

/**
 * Returns only mortgage liabilities for a user.
 * Filters in memory — same rationale as getCreditLiabilities.
 * The discriminated union narrows the return type to MortgageLiability[].
 *
 * @param {string} userId - UUID of the user whose mortgage liabilities to fetch.
 * @returns {Promise<MortgageLiability[]>}
 */
export async function getMortgageLiabilities(userId: string): Promise<MortgageLiability[]> {
  const all = await getByUserId(userId);
  return all.filter((l): l is MortgageLiability => l.liabilityType === 'mortgage');
}
