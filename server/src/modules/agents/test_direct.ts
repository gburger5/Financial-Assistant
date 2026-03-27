/**
 * @module testDirect
 * @description Standalone script that runs the investing agent and prints the
 * structured output to the console.
 *
 * Usage: npx tsx src/modules/agents/test_direct.ts
 */

import 'dotenv/config';
import { invokeInvestingAgent } from './investing-agent.js';
import type { InvestingAgentInput } from '../../types.js';

/** Hardcoded test input matching the user's local DynamoDB investment data. */
const testInput: InvestingAgentInput = {
  userId: '20da96f1-fe41-4dc1-9fdd-9b7b7efc0400',
  investingAllocation: 1090,
  userAge: 25,
  accounts: [
    {
      account_id: '87ndbo8dQrtRQvLgavKmiyAJzdrwleUWlWjNK',
      name: 'Roth 401(k)',
      institution_name: null,
      type: '401k',
      current_balance: 48250,
      holdings: [
        {
          security_name: 'Fidelity 500 Index Fund',
          ticker_symbol: 'FXAIX',
          quantity: 120.5,
          current_value: 4689.86,
        },
      ],
    },
    {
      account_id: 'EAqpdLgp6QHKZb7XpbDzcPrBoyJ5VwF4K4J6E',
      name: 'Roth IRA',
      institution_name: null,
      type: 'ira',
      current_balance: 18400,
      holdings: [],
    },
  ],
};

/**
 * Invokes the investing agent with the test fixture and prints the structured
 * investment plan to the console.
 */
async function main(): Promise<void> {
  const plan = await invokeInvestingAgent(testInput);

  console.log('\n' + '='.repeat(60));
  console.log('INVESTMENT PLAN');
  console.log('='.repeat(60));
  console.log(JSON.stringify(plan, null, 2));
  console.log('='.repeat(60) + '\n');
}

main().catch(console.error);
