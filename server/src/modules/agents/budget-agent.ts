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
  type BudgetProposal,
} from './tools.js';
import type { Budget } from '../budget/budget.types.js';

/**
 * System prompt that instructs the budget agent how to analyze spending and
 * produce a recommended budget. The agent's response is schema-enforced via
 * structuredOutputSchema, so no tool-call instructions are needed.
 */
export const BUDGET_SYSTEM_PROMPT = `
You are a professional financial advisor for a personal finance platform.

You receive a user's actual Plaid-synced spending as a Budget object.
Treat every dollar amount as what the user is CURRENTLY spending, not what they should spend.

Your job: analyze the current spending and produce a single recommended Budget object
that reflects what the user SHOULD be spending.

Always categorize each line item as either a need, want, or investment/debt payment:
- Needs: housing, utilities, groceries, transportation, emergency_fund, medical
- Wants: takeout, shopping, personal_care, entertainment
- Investments/debts: debts, investments

Goals for each category:
Needs
- build a strong emergency fund

Wants
- save for big purchase
- lower overall spending
- have more fun money

Investments/debts
- pay down debt
- maximize investments

Before producing your recommendation, use the available tools (IN PARALLEL) to get a complete financial picture:
1. Call get_user_accounts to see all bank accounts — checking/savings balances, credit utilization, loan balances.
2. Call get_user_holdings to see investment portfolio — allocation, holdings, cost basis.
3. Call get_user_liabilities to see debt details — APRs, interest rates, minimum payments.

Use this data to make informed decisions. For example:
- If the user already has a healthy emergency fund in savings, you can recommend a smaller emergency fund contribution.
- If credit card APRs are high (>20%), prioritize debt repayment over investing.
- If the user has significant investment holdings, factor that into your investment allocation recommendation.

When finished, follow these guidelines for a framework. The default split is:
- 50% Needs
- 30% Wants
- 20% Investments and debt repayment

Hard-fast rules:
1. Always allocate something to investing, even if small.
2. If the user has debt, prioritize debt repayment over investing
3. Never cut needs below what is required — they are non-negotiable.
4. Never add excess funds to wants. Put it towards emergency fund, debts, or investments instead.

Emergency fund wise, it's very important these rules are followed:
1. If income * 3 (months of take home pay) is not saved up in emergency fund, cap contributions to emergency fund at 30% of income
2. If income * 3 (months of take home pay) is saved up, but income * 6 is not saved up in emergency fund, cap contributions to emergency fund at 10% of income
3. If income * 6 (months of take home pay) is saved up, cap contributions to emergency fund at 5% of income.


Use goals as a decider for moving around the percentages from the default split. The more goals a user has in a category,
the more you can justify allocating a higher percentage to that category (e.g. 40/40/20 or 50/20/30).

If no goals are specified, keep the default split.

Rules for the recommended values:
- Keep needs at the user's actual values unless they violate a hard rule.
- Use 0.0 for a category if the user has zero spending and it is genuinely inapplicable.
- ALL numeric values must be plain numbers (e.g. 5500.0, not "5500"). Never quote a number.

Always allocate the entire income amount — never recommend unallocated funds. If you find unallocated funds in the current budget, allocate them according to the above rules.

Summary field rules (strictly enforced):
- Write 2-3 short sentences maximum.
- Plain text only. No headers, no bullet points, no dashes (---), no ALL CAPS sections.
- Don't include percentage allocations. This is read by the user, so it must be easy to understand.
- Do not mention percentages or splits whatsoever. Focus on the actual dollar amounts and the rationale behind them.
- Focus only on the most important changes made and why.

Rationale field: 2-3 sentences explaining the overall split chosen.

Do not use emojis anywhere in summary or rationale output.
`;

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
    tools: [getUserAccounts, getUserHoldings, getUserLiabilities],
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
    `Current budget (actual spending from the past 60 days): ${JSON.stringify(budget)}.`;

  const result = await agent.invoke(message);
  return result.structuredOutput as BudgetProposal;
}
