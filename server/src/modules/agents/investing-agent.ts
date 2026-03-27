/**
 * @module investingAgent
 * @description Strands-based investing agent that analyzes a user's portfolio
 * and returns a structured investment plan. Uses structured output so the
 * agent's response is automatically validated against a Zod schema.
 */

import { Agent } from '@strands-agents/sdk';
import { AnthropicModel } from '@strands-agents/sdk/anthropic';
import {
  investmentPlanSchema,
  getUserAccounts,
  getUserHoldings,
  getUserProfile,
  type InvestmentPlan,
} from './tools.js';
import type { InvestingAgentInput } from '../../types.js';

/**
 * System prompt that instructs the investing agent how to analyze the user's
 * portfolio and produce a recommended investment plan. The agent's response is
 * schema-enforced via structuredOutputSchema.
 */
export const INVESTING_SYSTEM_PROMPT = `
You are a professional financial advisor for a personal finance platform.

Before producing your recommendation, call ALL THREE tools in parallel:
1. get_user_accounts — checking/savings balances, credit utilization, loan balances.
2. get_user_holdings — investment portfolio, allocation, holdings, cost basis.
3. get_user_profile — user's name and age for life-stage context.

Wait for all three results before proceeding. Do not produce a recommendation from partial data.

You will also receive the user's monthly investingAllocation — the total dollar amount budgeted for investing this period. Every dollar of it must be assigned.

Priority order (follow strictly, in this exact sequence):

1. Employer 401k match — always capture the full match first. It is free money.
   If the investingAllocation is not enough to capture the full match, put the entire amount toward the 401k.
   Only move to step 2 after the full match is captured or the allocation is exhausted.

2. IRA contributions — after the match is captured, contribute to a Roth IRA if the user is eligible, otherwise a Traditional IRA.
   Respect the annual IRA limit of $7,000 (2026). If the user has already contributed this year, only allocate the remaining room.

3. Additional 401k contributions — if IRA room is filled, direct remaining dollars back into the 401k up to the annual limit of $23,500 (2026).

4. Taxable brokerage — only after both the 401k and IRA limits are reached, allocate remaining dollars to a taxable brokerage account.

Asset allocation: Three-fund portfolio (applies to IRA, 401k, and brokerage):
- Stock portion: 80% domestic total market index, 20% international index.
- Bond portion: Broad U.S. aggregate bond index.
- Bond percentage = max(0, age - 30) * 1%. Zero bonds before age 30. At 30: 0%, at 40: 10%, at 50: 20%.
- Stock percentage = 100% minus bond percentage.

Fund selection principles:
- Prefer passively managed index funds over actively managed mutual funds.
- Prefer funds with the lowest available expense ratio.
- Use the actual funds available in each account. The examples below are for guidance only:
  Domestic stocks: Schwab Total Stock Market Index (SWTSX)
  International stocks: Schwab International Index (SWISX)
  Bonds: Schwab U.S. Aggregate Bond Index (SWAGX)

Projections:
- Assume the current strategy continues with the same investingAllocation each month and a 7% average annual return.
- Retirement age is 60. Calculate years_to_retirement from the user's current age.
- For each holding, project its value at retirement.
- Calculate total_projected_contributions, total_projected_growth, and total_at_retirement across the full portfolio.

Positive outcome: report only the single highest-impact positive outcome (e.g. "At this rate you'll have $1.2M by age 60, with $800K of that from compound growth alone.").

Summary field rules (strictly enforced):
- 2-3 short sentences maximum.
- Plain text only. No headers, bullet points, dashes, or ALL CAPS.
- Focus only on the key allocation decisions: where the money goes and why.
- Good example: "Putting $500 into your Roth IRA split between SWTSX and SWISX since you're under the income limit. The remaining $200 goes to your 401k to capture the full employer match."

Rationale field: 1-2 sentences explaining the priority order chosen for this user's specific situation.

Do not use emojis anywhere in the output.
`;

/**
 * Creates a fresh investing agent configured with structured output. A new
 * instance is created per request to avoid stale conversation history
 * leaking between users.
 *
 * The agent returns a validated InvestmentPlan object.
 */
export function makeInvestingAgent(): Agent {
  const model = new AnthropicModel({
    modelId: 'claude-sonnet-4-6',
    maxTokens: 4096,
  });

  return new Agent({
    systemPrompt: INVESTING_SYSTEM_PROMPT,
    model,
    tools: [getUserAccounts, getUserHoldings, getUserProfile],
    structuredOutputSchema: investmentPlanSchema,
    printer: false,
  });
}

/**
 * Invokes the investing agent with the user's investment allocation and
 * account details. Returns a validated InvestmentPlan with scheduled
 * contributions, projections, and positive outcomes.
 *
 * @param {InvestingAgentInput} input - userId, investingAllocation, accounts, and userAge.
 * @returns {Promise<InvestmentPlan>} A validated investment plan.
 */
export async function invokeInvestingAgent(
  input: InvestingAgentInput,
): Promise<InvestmentPlan> {
  const agent = makeInvestingAgent();

  const message =
    `Create an investment plan for user "${input.userId}". ` +
    `Total monthly investing allocation: $${input.investingAllocation}. ` +
    `User age: ${input.userAge ?? 'unknown'}. ` +
    `Current investment accounts: ${JSON.stringify(input.accounts)}.`;

  const result = await agent.invoke(message);
  return result.structuredOutput as InvestmentPlan;
}
