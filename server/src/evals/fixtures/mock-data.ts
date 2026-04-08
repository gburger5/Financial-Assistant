/**
 * @module fixtures/mock-data
 * @description Factory functions for building mock financial data used by
 * eval cases. Each factory returns objects with the EXACT shape of the real
 * service return types so the production tool callbacks (which wrap, validate,
 * and shape these) execute unchanged against eval data.
 *
 * These are pure data builders, not test fixtures with side effects. They
 * are imported by case definitions in /cases/*.cases.ts.
 */

import type { Account } from '../../modules/accounts/accounts.types.js';
import type {
  CreditLiability,
  StudentLiability,
  MortgageLiability,
} from '../../modules/liabilities/liabilities.types.js';
import type { Holding } from '../../modules/investments/investments.types.js';
import type { PublicUser } from '../../modules/auth/auth.service.js';
import type { Budget, BudgetGoal } from '../../modules/budget/budget.types.js';

const NOW = '2026-04-07T00:00:00.000Z';

/**
 * Default user used by eval cases. Birthday is set to make the user 30 years
 * old as of NOW; cases that need a different age override `birthday`.
 *
 * @param {Partial<PublicUser>} overrides
 * @returns {PublicUser}
 */
export function makeUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    userId: 'eval-user-01',
    firstName: 'Eval',
    lastName: 'User',
    email: 'eval@example.com',
    createdAt: NOW,
    agentBudgetApproved: false,
    birthday: '1996-01-01',
    ...overrides,
  };
}

/**
 * Builds a full Account row matching the DynamoDB schema. Defaults are a
 * Chase checking account; pass `subtype`, `type`, and `currentBalance` for
 * other shapes.
 *
 * @param {Partial<Account>} overrides
 * @returns {Account}
 */
export function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    userId: 'eval-user-01',
    plaidAccountId: 'acc_default',
    itemId: 'item_default',
    name: 'Chase Checking',
    officialName: 'Chase Total Checking',
    mask: '0001',
    type: 'depository',
    subtype: 'checking',
    currentBalance: 5000,
    availableBalance: 5000,
    limitBalance: null,
    isoCurrencyCode: 'USD',
    unofficialCurrencyCode: null,
    updatedAt: NOW,
    createdAt: NOW,
    ...overrides,
  };
}

/**
 * Convenience builder for a depository checking account with a given balance.
 *
 * @param {string} plaidAccountId
 * @param {number} currentBalance
 * @returns {Account}
 */
export function makeChecking(plaidAccountId: string, currentBalance: number): Account {
  return makeAccount({
    plaidAccountId,
    name: 'Checking',
    type: 'depository',
    subtype: 'checking',
    currentBalance,
    availableBalance: currentBalance,
  });
}

/**
 * Convenience builder for a depository savings account.
 *
 * @param {string} plaidAccountId
 * @param {number} currentBalance
 * @returns {Account}
 */
export function makeSavings(plaidAccountId: string, currentBalance: number): Account {
  return makeAccount({
    plaidAccountId,
    name: 'Savings',
    type: 'depository',
    subtype: 'savings',
    currentBalance,
    availableBalance: currentBalance,
  });
}

/**
 * Convenience builder for a credit card account. limitBalance is the credit
 * limit; currentBalance is the outstanding statement balance.
 *
 * @param {string} plaidAccountId
 * @param {number} currentBalance
 * @param {number} limitBalance
 * @returns {Account}
 */
export function makeCreditAccount(
  plaidAccountId: string,
  currentBalance: number,
  limitBalance: number,
): Account {
  return makeAccount({
    plaidAccountId,
    name: 'Credit Card',
    type: 'credit',
    subtype: 'credit card',
    currentBalance,
    availableBalance: limitBalance - currentBalance,
    limitBalance,
  });
}

/**
 * Convenience builder for an investment account (401k / IRA / brokerage).
 *
 * @param {string} plaidAccountId
 * @param {string} subtype - One of '401k' | 'ira' | 'roth' | 'brokerage'.
 * @param {number} currentBalance
 * @param {string} [name]
 * @returns {Account}
 */
export function makeInvestmentAccount(
  plaidAccountId: string,
  subtype: string,
  currentBalance: number,
  name?: string,
): Account {
  return makeAccount({
    plaidAccountId,
    name: name ?? `${subtype.toUpperCase()} Account`,
    type: 'investment',
    subtype,
    currentBalance,
    availableBalance: null,
  });
}

/**
 * Builds a credit-card liability with a single APR tier.
 *
 * @param {string} plaidAccountId
 * @param {number} aprPercentage - APR as a percent (24.99 for 24.99%).
 * @param {number} minimumPayment
 * @returns {CreditLiability}
 */
export function makeCreditLiability(
  plaidAccountId: string,
  aprPercentage: number,
  minimumPayment: number,
): CreditLiability {
  return {
    userId: 'eval-user-01',
    sortKey: `${plaidAccountId}#01ARZ3NDEKTSV4RRFFQ69G5FAV`,
    plaidAccountId,
    currentBalance: null,
    createdAt: NOW,
    updatedAt: NOW,
    liabilityType: 'credit',
    details: {
      minimumPaymentAmount: minimumPayment,
      nextPaymentDueDate: '2026-05-01',
      lastPaymentAmount: minimumPayment,
      lastStatementBalance: 0,
      aprs: [
        {
          aprPercentage,
          aprType: 'purchase_apr',
          balanceSubjectToApr: null,
          interestChargeAmount: null,
        },
      ],
    },
  };
}

/**
 * Builds a student loan liability.
 *
 * @param {string} plaidAccountId
 * @param {number} interestRatePercentage
 * @param {number} minimumPayment
 * @param {number} principal
 * @returns {StudentLiability}
 */
export function makeStudentLiability(
  plaidAccountId: string,
  interestRatePercentage: number,
  minimumPayment: number,
  principal: number,
): StudentLiability {
  return {
    userId: 'eval-user-01',
    sortKey: `${plaidAccountId}#01ARZ3NDEKTSV4RRFFQ69G5FAV`,
    plaidAccountId,
    currentBalance: null,
    createdAt: NOW,
    updatedAt: NOW,
    liabilityType: 'student',
    details: {
      outstandingInterestAmount: 0,
      outstandingPrincipalAmount: principal,
      originationPrincipalAmount: principal,
      interestRatePercentage,
      minimumPaymentAmount: minimumPayment,
      servicerAddress: null,
      repaymentPlan: null,
      sequenceNumber: null,
    },
  };
}

/**
 * Builds a mortgage liability.
 *
 * @param {string} plaidAccountId
 * @param {number} interestRatePercentage
 * @param {number} nextMonthlyPayment
 * @returns {MortgageLiability}
 */
export function makeMortgageLiability(
  plaidAccountId: string,
  interestRatePercentage: number,
  nextMonthlyPayment: number,
): MortgageLiability {
  return {
    userId: 'eval-user-01',
    sortKey: `${plaidAccountId}#01ARZ3NDEKTSV4RRFFQ69G5FAV`,
    plaidAccountId,
    currentBalance: null,
    createdAt: NOW,
    updatedAt: NOW,
    liabilityType: 'mortgage',
    details: {
      outstandingPrincipalBalance: 250000,
      interestRatePercentage,
      nextMonthlyPayment,
      originationDate: '2020-01-01',
      maturityDate: '2050-01-01',
      propertyAddress: null,
      escrowBalance: null,
      hasPmi: false,
      hasPrepaymentPenalty: false,
    },
  };
}

/**
 * Builds a single Holding row matching the DynamoDB schema.
 *
 * @param {string} plaidAccountId
 * @param {string} ticker
 * @param {number} institutionValue
 * @param {Partial<Holding>} [overrides]
 * @returns {Holding}
 */
export function makeHolding(
  plaidAccountId: string,
  ticker: string,
  institutionValue: number,
  overrides: Partial<Holding> = {},
): Holding {
  return {
    userId: 'eval-user-01',
    snapshotDateAccountSecurity: `2026-04-07#${plaidAccountId}#sec_${ticker}`,
    plaidAccountId,
    securityId: `sec_${ticker}`,
    snapshotDate: '2026-04-07',
    quantity: 100,
    institutionPrice: institutionValue / 100,
    institutionValue,
    costBasis: institutionValue * 0.8,
    isoCurrencyCode: 'USD',
    unofficialCurrencyCode: null,
    securityName: `${ticker} Index Fund`,
    tickerSymbol: ticker,
    securityType: 'mutual fund',
    closePrice: institutionValue / 100,
    closePriceAsOf: '2026-04-07',
    isin: null,
    cusip: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/**
 * Builds a Budget object using flat numeric input. Each field is wrapped in
 * a BudgetAmount object to match the real Budget type. The coworker's
 * original eval plan got this wrong — fields are NOT plain numbers.
 *
 * @param {Record<string, number>} amounts - Map from category name to dollar amount.
 * @param {object} [opts]
 * @param {BudgetGoal[]} [opts.goals]
 * @returns {Budget}
 */
export function makeBudget(
  amounts: {
    income: number;
    housing: number;
    utilities: number;
    transportation: number;
    groceries: number;
    takeout: number;
    shopping: number;
    personalCare: number;
    emergencyFund: number;
    entertainment: number;
    medical: number;
    debts: number;
    investments: number;
  },
  opts: { goals?: BudgetGoal[] } = {},
): Budget {
  return {
    userId: 'eval-user-01',
    budgetId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    createdAt: NOW,
    income: { amount: amounts.income },
    housing: { amount: amounts.housing },
    utilities: { amount: amounts.utilities },
    transportation: { amount: amounts.transportation },
    groceries: { amount: amounts.groceries },
    takeout: { amount: amounts.takeout },
    shopping: { amount: amounts.shopping },
    personalCare: { amount: amounts.personalCare },
    emergencyFund: { amount: amounts.emergencyFund },
    entertainment: { amount: amounts.entertainment },
    medical: { amount: amounts.medical },
    debts: { amount: amounts.debts },
    investments: { amount: amounts.investments },
    goals: opts.goals ?? [],
  };
}
