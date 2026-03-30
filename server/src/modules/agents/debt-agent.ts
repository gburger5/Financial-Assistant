/**
 * @module debtAgent
 * @description Strands-based debt agent that analyzes a user's liabilities and
 * returns a structured debt payment plan. Uses structured output so the agent's
 * response is automatically validated against a Zod schema.
 */

import { Agent } from '@strands-agents/sdk';
import { AnthropicModel } from '@strands-agents/sdk/anthropic';
import {
  debtPaymentPlanSchema,
  getUserAccounts,
  getUserLiabilities,
  getUserProfile,
  type DebtPaymentPlan,
} from './tools.js';
import type { DebtAgentInput } from './agents.types.js';

/**
 * System prompt that instructs the debt agent how to analyze liabilities and
 * produce a recommended payment plan. The agent's response is schema-enforced
 * via structuredOutputSchema, so no tool-call instructions are needed beyond
 * the data-gathering step.
 */
export const DEBT_SYSTEM_PROMPT =
`
You are a professional financial advisor for a personal finance platform.

Before producing your recommendation, call ALL THREE tools in parallel:
1. get_user_accounts — checking/savings balances, credit utilization, loan balances.
2. get_user_liabilities — APRs, interest rates, minimum payments.
3. get_user_profile — user's name and age for life-stage context.

Wait for all three results before proceeding. Do not produce a recommendation from partial data.

You will also receive the user's monthly debtAllocation — the total dollar amount budgeted for debt repayment this period. Every dollar of it must be assigned.

Strategy: Avalanche (highest interest first)
1. Pay the minimum on every debt first.
2. Allocate all remaining dollars to the debt with the highest APR.
3. If that debt can be paid off entirely this period, pay it off and apply the remainder to the next highest APR debt.
4. Debts above 5% APR must always receive more than the minimum when extra funds are available.
5. Debts at or below 5% APR receive minimum payments only unless all higher-rate debts are eliminated.

Projections:
- For each debt, calculate months_to_payoff and total_interest_paid assuming the current strategy continues with the same debtAllocation each month.
- Calculate interest_savings by comparing total interest under this strategy versus minimum-only payments on all debts.
- Report only the highest impact positive outcome: freed-up cash flow when a debt is eliminated, total interest saved, milestones approaching (e.g. "Your Visa will be paid off in 3 months").

Summary field rules (strictly enforced):
- 2-3 short sentences maximum.
- Plain text only. No headers, bullet points, dashes, or ALL CAPS.
- Focus only on which debts get paid, how much each, and the key reason.
- Good example: "Paying the $150 minimum on your student loan and putting the remaining $350 toward your Visa at 24% APR. At this rate your Visa will be paid off in 8 months, saving $240 in interest."

Rationale field: 2-3 sentences explaining why the avalanche strategy applies to this user's specific situation.

Do not use emojis anywhere in the output.
`

/**
 * Creates a fresh debt agent configured with structured output. A new
 * instance is created per request to avoid stale conversation history
 * leaking between users.
 *
 * The agent returns a validated DebtPaymentPlan object.
 */
export function makeDebtAgent(): Agent {
  const model = new AnthropicModel({
    modelId: 'claude-sonnet-4-6',
    maxTokens: 4096,
  });

  return new Agent({
    systemPrompt: DEBT_SYSTEM_PROMPT,
    model,
    tools: [getUserAccounts, getUserLiabilities, getUserProfile],
    structuredOutputSchema: debtPaymentPlanSchema,
    printer: false,
  });
}

/**
 * Invokes the debt agent with the user's debt allocation and account details.
 * Returns a validated DebtPaymentPlan with scheduled payments, projections,
 * and interest savings.
 *
 * @param {DebtAgentInput} input - userId, debtAllocation, and debts array.
 * @returns {Promise<DebtPaymentPlan>} A validated debt payment plan.
 */
export async function invokeDebtAgent(
  input: DebtAgentInput,
): Promise<DebtPaymentPlan> {
  const agent = makeDebtAgent();

  const message =
    `Create a debt payment plan for user "${input.userId}". ` +
    `Total monthly debt allocation: $${input.debtAllocation}. ` +
    `Current debts: ${JSON.stringify(input.debts)}.`;

  const result = await agent.invoke(message);
  return result.structuredOutput as DebtPaymentPlan;
}
