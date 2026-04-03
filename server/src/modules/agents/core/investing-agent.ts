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
import type { InvestingAgentInput } from '../agents.types.js';

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
