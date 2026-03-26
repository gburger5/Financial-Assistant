/**
 * @module testDirect
 * @description Standalone script that runs the debt agent and prints the
 * structured output to the console.
 *
 * Usage: npx tsx src/modules/agents/test_direct.ts
 */

import 'dotenv/config';
import { invokeDebtAgent } from './debt-agent.js';
import type { DebtAgentInput } from '../../types.js';

/** Hardcoded test input matching the user's local DynamoDB liabilities data. */
const testInput: DebtAgentInput = {
  userId: '20da96f1-fe41-4dc1-9fdd-9b7b7efc0400',
  debtAllocation: 1502,
  debts: [
    {
      account_id: 'lnNAkm1LKNhvPMvR4BDWhNeMq4KnlripyR6Zl',
      name: 'Credit Card 1',
      institution_name: null,
      type: 'credit_card',
      current_balance: 1200,
      interest_rate: 22.99,
      minimum_payment: 35,
      next_payment_due_date: null,
    },
    {
      account_id: 'qyQA3JjExQFdrgdjeZo9T5Q6bEwxeqUgaRBdZ',
      name: 'Credit Card 2',
      institution_name: null,
      type: 'credit_card',
      current_balance: 2500,
      interest_rate: 19.99,
      minimum_payment: 55,
      next_payment_due_date: null,
    },
    {
      account_id: 'KDmPoAVj5mSMDrM7aEqxcENko6wByWHRP1rVa',
      name: 'Student Loan',
      institution_name: null,
      type: 'student_loan',
      current_balance: 38000,
      interest_rate: 5.5,
      minimum_payment: 412,
      next_payment_due_date: null,
    },
  ],
};

/**
 * Invokes the debt agent with the test fixture and prints the structured
 * payment plan to the console.
 */
async function main(): Promise<void> {
  const plan = await invokeDebtAgent(testInput);

  console.log('\n' + '='.repeat(60));
  console.log('DEBT PAYMENT PLAN');
  console.log('='.repeat(60));
  console.log(JSON.stringify(plan, null, 2));
  console.log('='.repeat(60) + '\n');
}

main().catch(console.error);
