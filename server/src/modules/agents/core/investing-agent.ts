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
import { INVESTING_SYSTEM_PROMPT } from './prompts.js';
import type { AgentInvokeResult, InvestingAgentInput } from '../agents.types.js';

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
 * account details. Returns the validated InvestmentPlan alongside the raw SDK
 * metrics snapshot so the caller can persist invocation metrics separately.
 *
 * @param {InvestingAgentInput} input - userId, investingAllocation, accounts, and userAge.
 * @returns {Promise<AgentInvokeResult<InvestmentPlan>>} The plan and SDK metrics.
 */
export async function invokeInvestingAgent(
  input: InvestingAgentInput,
): Promise<AgentInvokeResult<InvestmentPlan>> {
  const agent = makeInvestingAgent();

  const message =
    `Create an investment plan for user "${input.userId}". ` +
    `Total monthly investing allocation: $${input.investingAllocation}. ` +
    `User age: ${input.userAge ?? 'unknown'}. ` +
    `Current investment accounts: ${JSON.stringify(input.accounts)}.`;

  const result = await agent.invoke(message);
  return { output: result.structuredOutput as InvestmentPlan, metrics: result.metrics };
}
