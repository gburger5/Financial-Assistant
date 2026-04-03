/**
 * @module agentTools
 * @description Shared tool definitions and schemas for Strands agents. Tools
 * are console-only — no database writes or external side effects. Intended
 * for local development and testing.
 */

import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { getAccountsForUser } from '../../accounts/accounts.service.js';
import { getUserById } from '../../auth/auth.service.js';
import { getLatestHoldings } from '../../investments/investments.service.js';
import { getLiabilitiesForUser } from '../../liabilities/liabilities.service.js';

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

/**
 * Zod schema for the debt payment plan output. Used as structuredOutputSchema
 * by the debt agent so responses are automatically validated.
 */
export const debtPaymentPlanSchema = z.object({
  summary: z
    .string()
    .describe(
      'Two to three short plain-text sentences. No headers, bullets, dashes, or ALL CAPS. ' +
      'Focus only on which debts get paid, how much each, and the key reason.'
    ),

  rationale: z
    .string()
    .describe(
      'Two to three sentences explaining the overall strategy chosen (avalanche, snowball, or hybrid) and why.'
    ),

  scheduled_payments: z
    .array(
      z.object({
        plaid_account_id: z.string().describe('The Plaid account ID for this debt.'),
        debt_name: z.string().describe('Human-readable name of the debt (e.g. "Chase Sapphire Visa").'),
        amount: z.number().describe('Dollar amount to pay this period.'),
        payment_type: z
          .enum(['minimum', 'extra', 'payoff'])
          .describe('"minimum" for minimum payment, "extra" for above-minimum, "payoff" for full remaining balance.'),
      })
    )
    .describe(
      'One payment object per debt account receiving a payment this period. ' +
      'The sum of all amounts must equal the total debtAllocation exactly.'
    ),

  projections: z
    .array(
      z.object({
        plaid_account_id: z.string().describe('The Plaid account ID for this debt.'),
        debt_name: z.string().describe('Human-readable name of the debt.'),
        current_balance: z.number().describe('Current outstanding balance.'),
        apr: z.number().describe('Annual percentage rate as a decimal (e.g. 0.24 for 24%).'),
        months_to_payoff: z.number().describe('Estimated months until this debt is fully paid off.'),
        total_interest_paid: z
          .number()
          .describe('Total interest that will be paid over the life of this debt under the current strategy.'),
      })
    )
    .describe('One projection per debt account showing payoff timeline and interest costs.'),

  interest_savings: z
    .number()
    .describe('Total interest saved compared to making only minimum payments across all debts.'),

  positive_outcomes: z
    .string()
    .describe(
      'The highest impact positive outcome: freed-up cash flow when a debt is paid off, ' +
      'total interest saved, or other encouraging facts.'
    ),
});

/** TypeScript type inferred from the debt payment plan schema. */
export type DebtPaymentPlan = z.infer<typeof debtPaymentPlanSchema>;

/**
 * Zod schema for the investment plan output. Used as structuredOutputSchema
 * by the investing agent so responses are automatically validated.
 */
export const investmentPlanSchema = z.object({
  summary: z
    .string()
    .describe(
      'Two to three short plain-text sentences. No headers, bullets, dashes, or ALL CAPS. ' +
      'Focus only on the key allocation decisions: where the money goes and why.'
    ),

  rationale: z
    .string()
    .describe(
      'One to two sentences explaining the overall priority order chosen for this user.'
    ),

  scheduled_contributions: z
    .array(
      z.object({
        plaid_account_id: z.string().describe('The Plaid account ID for this investment account.'),
        account_name: z.string().describe('Human-readable name of the account (e.g. "Fidelity Roth IRA").'),
        amount: z.number().describe('Dollar amount to contribute this period.'),
        contribution_type: z
          .enum(['401k', 'roth_ira', 'traditional_ira', 'brokerage'])
          .describe('The type of account receiving the contribution.'),
        fund_ticker: z
          .string()
          .nullable()
          .describe('Ticker symbol of the target fund (e.g. "SWTSX"), or null if not applicable.'),
        fund_name: z
          .string()
          .nullable()
          .describe('Human-readable fund name (e.g. "Schwab Total Stock Market Index"), or null if not applicable.'),
      })
    )
    .describe(
      'One contribution object per account receiving money this period. ' +
      'The sum of all amounts must equal the investingAllocation exactly.'
    ),

  projections: z.object({
    retirement_age: z.number().describe('The target retirement age used for projections (60).'),
    years_to_retirement: z.number().describe('Years remaining until retirement age.'),
    assumed_annual_return: z.number().describe('The annual return rate used for projections (0.07 for 7%).'),
    total_projected_contributions: z
      .number()
      .describe('Total dollar amount the user will contribute between now and retirement at the current monthly rate.'),
    total_projected_growth: z
      .number()
      .describe('Total investment growth (returns minus contributions) projected by retirement.'),
    total_at_retirement: z
      .number()
      .describe('Total portfolio value at retirement (contributions plus growth).'),
    holdings: z
      .array(
        z.object({
          fund_ticker: z.string().describe('Ticker symbol of the holding.'),
          fund_name: z.string().describe('Human-readable fund name.'),
          current_value: z.number().describe('Current market value of this holding.'),
          projected_value_at_retirement: z
            .number()
            .describe('Projected value of this holding at retirement assuming continued contributions and 7% annual return.'),
        })
      )
      .describe('Per-holding projections showing current value and projected retirement value.'),
  }),

  positive_outcome: z
    .string()
    .describe(
      'One to two short plain-text sentences highlighting the single highest-impact positive outcome. ' +
      'No headers, bullets, or dashes.'
    ),
});

/** TypeScript type inferred from the investment plan schema. */
export type InvestmentPlan = z.infer<typeof investmentPlanSchema>;

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

/**
 * Computes a user's age in whole years from their birthday.
 * Accounts for whether the birthday has occurred yet this year.
 *
 * @param {string} birthday - ISO date string (YYYY-MM-DD).
 * @returns {number} Age in whole years.
 */
function computeAge(birthday: string): number {
  const birth = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Retrieves a user's name and age. Age is computed from their birthday.
 * Returns null for age if the user has not set a birthday yet.
 */
export const getUserProfile = tool({
  name: 'get_user_profile',
  description:
    'Retrieve a user\'s name and age. Returns firstName, lastName, and age ' +
    '(in years, computed from birthday). Age is null if the user has not set ' +
    'a birthday. Use this to personalize advice and factor in life stage — ' +
    'e.g. younger users have a longer investment horizon, older users may ' +
    'need more conservative allocations.',
  inputSchema: userIdSchema,
  callback: async (input: z.infer<typeof userIdSchema>) => {
    const user = await getUserById(input.userId);
    return {
      firstName: user.firstName,
      lastName: user.lastName,
      age: user.birthday ? computeAge(user.birthday) : null,
    };
  },
});
