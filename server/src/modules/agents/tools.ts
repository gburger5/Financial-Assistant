/**
 * @module agentTools
 * @description Shared tool definitions and schemas for Strands agents. Tools
 * are console-only — no database writes or external side effects. Intended
 * for local development and testing.
 */

import { tool } from '@strands-agents/sdk';
import { z } from 'zod';

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
 * Console-only budget proposal tool. Prints the proposal as formatted JSON
 * and returns a dry-run acknowledgment. No database or external writes.
 */
export const submitBudgetProposal = tool({
  name: 'submit_budget_proposal',
  description: 'Submit a budget proposal for user review. Prints the proposal to the console.',
  inputSchema: budgetProposalSchema,
  callback: (input: BudgetProposal) => {
    const proposal = {
      budget: {
        income: { amount: input.income },
        housing: { amount: input.housing },
        utilities: { amount: input.utilities },
        transportation: { amount: input.transportation },
        groceries: { amount: input.groceries },
        takeout: { amount: input.takeout },
        shopping: { amount: input.shopping },
        personalCare: { amount: input.personalCare },
        emergencyFund: { amount: input.emergencyFund },
        entertainment: { amount: input.entertainment },
        medical: { amount: input.medical },
        debts: { amount: input.debts },
        investments: { amount: input.investments },
        goals: [],
      },
      summary: input.summary,
      rationale: input.rationale,
    };

    console.log('\n' + '='.repeat(60));
    console.log('BUDGET PROPOSAL');
    console.log('='.repeat(60));
    console.log(JSON.stringify(proposal, null, 2));
    console.log('='.repeat(60) + '\n');

    return { status: 'printed', proposalId: 'dry-run' };
  },
});
