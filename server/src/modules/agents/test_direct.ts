/**
 * @module testDirect
 * @description Standalone script that runs the budget agent and prints the
 * structured output to the console. No DynamoDB or external side effects.
 *
 * Usage: npx tsx src/modules/agents/test_direct.ts
 */

import 'dotenv/config';
import { invokeBudgetAgent } from './budget-agent.js';
import type { Budget } from '../budget/budget.types.js';

/** Hardcoded test budget matching the Python test_direct.py fixture. */
const testBudget: Budget = {
  userId: 'test-user-123',
  budgetId: 'test-budget-001',
  createdAt: new Date().toISOString(),
  income: { amount: 5636.45 },
  housing: { amount: 1500 },
  utilities: { amount: 50 },
  transportation: { amount: 142.14 },
  groceries: { amount: 426.71 },
  takeout: { amount: 106.82 },
  shopping: { amount: 350.71 },
  personalCare: { amount: 132.05 },
  emergencyFund: { amount: 600 },
  entertainment: { amount: 14.99 },
  medical: { amount: 47.36 },
  debts: { amount: 502 },
  investments: { amount: 1090.03 },
  goals: ['pay down debt'],
};

/**
 * Invokes the budget agent with the test fixture and prints the structured
 * proposal to the console.
 */
async function main(): Promise<void> {
  const proposal = await invokeBudgetAgent('test-user-123', testBudget);

  console.log('\n' + '='.repeat(60));
  console.log('BUDGET PROPOSAL');
  console.log('='.repeat(60));
  console.log(JSON.stringify(proposal, null, 2));
  console.log('='.repeat(60) + '\n');
}

main().catch(console.error);
