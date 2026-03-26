/**
 * @module agentTools
 * @description Shared tool definitions and schemas for Strands agents. Tools
 * are console-only — no database writes or external side effects. Intended
 * for local development and testing.
 */

import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { getAccountsForUser } from '../accounts/accounts.service.js';
import { getLatestHoldings } from '../investments/investments.service.js';
import { getLiabilitiesForUser } from '../liabilities/liabilities.service.js';

/**
 * Zod schema for the budget proposal output. Field names match the server's
 * Budget type so the structured output can be used directly without mapping.
 * Shared between the structured output schema in budget-agent.ts and the
 * console-print tool below.
 */
export const budgetProposalSchema = z.object({
  summary: z.string().describe('Human-readable breakdown shown to the user'),
  rationale: z.string().describe('Why you chose this specific split; reference user goals when relevant'),
  income: z.number().describe('Monthly take-home income'),
  housing: z.number().describe('Recommended monthly housing (rent or mortgage)'),
  utilities: z.number().describe('Recommended monthly utilities'),
  transportation: z.number().describe('Recommended monthly transportation'),
  groceries: z.number().describe('Recommended monthly groceries'),
  takeout: z.number().describe('Recommended monthly takeout and restaurants'),
  shopping: z.number().describe('Recommended monthly shopping'),
  personalCare: z.number().describe('Recommended monthly personal care'),
  emergencyFund: z.number().describe('Recommended monthly emergency fund contribution'),
  entertainment: z.number().describe('Recommended monthly entertainment'),
  medical: z.number().describe('Recommended monthly medical'),
  debts: z.number().describe('Recommended monthly debt payments'),
  investments: z.number().describe('Recommended monthly investment contribution'),
});

/** TypeScript type inferred from the budget proposal schema. */
export type BudgetProposal = z.infer<typeof budgetProposalSchema>;

/** Input schema shared by all user-data retrieval tools. */
const userIdSchema = z.object({
  userId: z.string().describe('UUID of the user whose data to retrieve'),
});

/**
 * Retrieves all bank accounts (checking, savings, credit, loan, investment)
 * for a user from DynamoDB. Returns balances, account types, and metadata.
 */
export const getUserAccounts = tool({
  name: 'get_user_accounts',
  description:
    'Retrieve all bank accounts for a user. Returns an array of accounts with ' +
    'fields: name, type (depository/credit/loan/investment), subtype, ' +
    'currentBalance, availableBalance, limitBalance, and isoCurrencyCode. ' +
    'Use this to understand the user\'s full financial picture — checking vs ' +
    'savings balances, credit utilization, and loan balances.',
  inputSchema: userIdSchema,
  callback: async (input: z.infer<typeof userIdSchema>) => {
    const accounts = await getAccountsForUser(input.userId);
    return JSON.parse(JSON.stringify({ accounts }));
  },
});

/**
 * Retrieves the latest investment holdings snapshot for a user. Returns
 * ticker symbols, quantities, values, cost basis, and security types.
 */
export const getUserHoldings = tool({
  name: 'get_user_holdings',
  description:
    'Retrieve the latest investment holdings for a user. Returns an array of ' +
    'holdings with fields: tickerSymbol, securityName, securityType ' +
    '(etf/mutual fund/equity/etc.), quantity, institutionPrice, ' +
    'institutionValue, costBasis, and closePrice. Use this to understand ' +
    'the user\'s investment allocation and portfolio composition.',
  inputSchema: userIdSchema,
  callback: async (input: z.infer<typeof userIdSchema>) => {
    const holdings = await getLatestHoldings(input.userId);
    return JSON.parse(JSON.stringify({ holdings }));
  },
});

/**
 * Retrieves the latest liability snapshot (credit cards, student loans,
 * mortgages) for a user. Returns APRs, minimum payments, and balances.
 */
export const getUserLiabilities = tool({
  name: 'get_user_liabilities',
  description:
    'Retrieve the latest liabilities for a user. Returns an array of liabilities, ' +
    'each with liabilityType (credit/student/mortgage) and a details object. ' +
    'Credit: minimumPaymentAmount, aprs (with aprPercentage and aprType). ' +
    'Student: minimumPaymentAmount, interestRatePercentage, outstandingInterestAmount, ' +
    'originationPrincipalAmount, repaymentPlan. ' +
    'Mortgage: nextMonthlyPayment, interestRatePercentage, outstandingPrincipalBalance. ' +
    'Use this to understand debt obligations, interest rates, and minimum payments — ' +
    'critical for deciding how to split between debt repayment and investing.',
  inputSchema: userIdSchema,
  callback: async (input: z.infer<typeof userIdSchema>) => {
    const liabilities = await getLiabilitiesForUser(input.userId);
    return JSON.parse(JSON.stringify({ liabilities }));
  },
});
