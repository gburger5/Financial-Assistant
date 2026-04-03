/**
 * @module budgetAgent
 * @description Strands-based budget agent that analyzes a user's Plaid-synced
 * spending and returns a structured budget proposal. Uses structured output
 * so the agent's response is automatically validated against a Zod schema
 */

import { Agent } from '@strands-agents/sdk';
import { AnthropicModel } from '@strands-agents/sdk/anthropic';
import {
  budgetProposalSchema,
  getUserAccounts,
  getUserHoldings,
  getUserLiabilities,
  getUserProfile,
  type BudgetProposal,
} from './tools.js';
import { BUDGET_SYSTEM_PROMPT } from './prompts.js';
import type { Budget } from '../../budget/budget.types.js';

/**
 * Creates a fresh budget agent configured with structured output. A new
 * instance is created per request to avoid stale conversation history
 * leaking between users.
 *
 * The agent returns a validated BudgetProposal object — no tool calls needed.
 */
export function makeBudgetAgent(): Agent {
  const model = new AnthropicModel({
    modelId: 'claude-sonnet-4-6',
    maxTokens: 4096,
  });

  return new Agent({
    systemPrompt: BUDGET_SYSTEM_PROMPT,
    model,
    tools: [getUserAccounts, getUserHoldings, getUserLiabilities, getUserProfile],
    structuredOutputSchema: budgetProposalSchema,
    printer: false
  });
}

/**
 * Invokes the budget agent with the user's current Plaid-synced budget.
 * Returns a validated BudgetProposal with all recommended amounts, summary,
 * and rationale.
 *
 * @param userId - UUID of the user requesting the budget analysis.
 * @param budget - The user's current budget from the Budgets table.
 * @returns A validated BudgetProposal object.
 */
export async function invokeBudgetAgent(
  userId: string,
  budget: Budget,
): Promise<BudgetProposal> {
  const agent = makeBudgetAgent();

  const message =
    `Analyze the following actual spending budget for user "${userId}". ` +
    `Then recommend an improved budget. ` +
    `Current budget: ${JSON.stringify(budget)}.`;

  const result = await agent.invoke(message);
  return result.structuredOutput as BudgetProposal;
}
