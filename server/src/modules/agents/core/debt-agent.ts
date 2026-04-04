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
  getUserFinancialSnapshot,
  type DebtPaymentPlan,
} from './tools.js';
import { DEBT_SYSTEM_PROMPT } from './prompts.js';
import type { AgentInvokeResult, DebtAgentInput } from '../agents.types.js';

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
    tools: [getUserAccounts, getUserLiabilities, getUserProfile, getUserFinancialSnapshot],
    structuredOutputSchema: debtPaymentPlanSchema,
    printer: false,
  });
}

/**
 * Invokes the debt agent with the user's debt allocation and account details.
 * Returns the validated DebtPaymentPlan alongside the raw SDK metrics snapshot
 * so the caller can persist invocation metrics separately.
 *
 * @param {DebtAgentInput} input - userId, debtAllocation, and debts array.
 * @returns {Promise<AgentInvokeResult<DebtPaymentPlan>>} The plan and SDK metrics.
 */
export async function invokeDebtAgent(
  input: DebtAgentInput,
): Promise<AgentInvokeResult<DebtPaymentPlan>> {
  const agent = makeDebtAgent();

  const message =
    `Create a debt payment plan for user "${input.userId}". ` +
    `Total monthly debt allocation: $${input.debtAllocation}. ` +
    `Current debts: ${JSON.stringify(input.debts)}.`;

  const result = await agent.invoke(message);
  return { output: result.structuredOutput as DebtPaymentPlan, metrics: result.metrics };
}
