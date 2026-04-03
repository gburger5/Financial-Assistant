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
import { DEBT_SYSTEM_PROMPT } from './prompts.js';
import type { DebtAgentInput } from '../agents.types.js';

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
