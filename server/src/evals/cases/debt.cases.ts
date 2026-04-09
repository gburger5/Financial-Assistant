/**
 * @module cases/debt.cases
 * @description Eval case scenarios for the debt agent. Each case targets a
 * specific avalanche-strategy decision: classic 3-debt avalanche, allocation
 * exactly equal to minimums, allocation below minimums, payoff cascade.
 */

import type { DebtEvalCase } from '../eval.types.js';
import { makeUser, makeChecking } from '../fixtures/mock-data.js';
import type { DebtAccount } from '../../modules/agents/agents.types.js';

const USER_ID = 'eval-user-01';

const STANDARD_DEBTS: DebtAccount[] = [
  {
    account_id: 'acc_visa',
    name: 'Chase Visa',
    institution_name: 'Chase',
    type: 'credit_card',
    current_balance: 5000,
    interest_rate: 0.2499,
    minimum_payment: 150,
    next_payment_due_date: '2026-05-01',
  },
  {
    account_id: 'acc_student',
    name: 'Student Loan',
    institution_name: 'Sallie Mae',
    type: 'student_loan',
    current_balance: 25000,
    interest_rate: 0.068,
    minimum_payment: 280,
    next_payment_due_date: '2026-05-15',
  },
  {
    account_id: 'acc_auto',
    name: 'Honda Auto Loan',
    institution_name: 'Honda Financial',
    type: 'other',
    current_balance: 12000,
    interest_rate: 0.045,
    minimum_payment: 250,
    next_payment_due_date: '2026-05-10',
  },
];

/** All debt eval cases. */
export const debtCases: DebtEvalCase[] = [
  // Case 1: classic 3-debt avalanche. Surplus should go to the credit card.
  {
    id: 'debt-classic-avalanche',
    name: 'Classic 3-debt avalanche',
    description:
      'Three debts (24.99% credit, 6.8% student, 4.5% auto) with $1000 ' +
      'allocation. Surplus ($320) should go entirely to the credit card.',
    agentType: 'debt',
    input: {
      userId: USER_ID,
      debtAllocation: 1000,
      debts: STANDARD_DEBTS,
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 5000)],
      holdings: [],
      liabilities: [],
      user: makeUser(),
    },
  },

  // Case 2: single debt, simple case.
  {
    id: 'debt-single-debt',
    name: 'Single credit card debt',
    description:
      'One credit card with $500 allocation and $100 minimum. All surplus ' +
      'goes to this single debt.',
    agentType: 'debt',
    input: {
      userId: USER_ID,
      debtAllocation: 500,
      debts: [
        {
          account_id: 'acc_visa',
          name: 'Chase Visa',
          institution_name: 'Chase',
          type: 'credit_card',
          current_balance: 3000,
          interest_rate: 0.2299,
          minimum_payment: 100,
          next_payment_due_date: '2026-05-01',
        },
      ],
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 4000)],
      holdings: [],
      liabilities: [],
      user: makeUser(),
    },
  },

  // Case 3: allocation equals minimums. Tests zero-surplus handling.
  {
    id: 'debt-allocation-equals-minimums',
    name: 'Allocation equals total minimums',
    description:
      'Three debts with minimums totaling exactly $680, allocation is $680. ' +
      'No surplus available. Each debt gets exactly its minimum.',
    agentType: 'debt',
    input: {
      userId: USER_ID,
      debtAllocation: 680,
      debts: STANDARD_DEBTS,
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 3000)],
      holdings: [],
      liabilities: [],
      user: makeUser(),
    },
  },

  // Case 4: payoff cascade. Small credit card balance with large allocation.
  {
    id: 'debt-payoff-cascade',
    name: 'Payoff cascade across debts',
    description:
      'Credit card with $200 remaining balance gets paid off in full; ' +
      'remaining surplus cascades to next-highest APR debt.',
    agentType: 'debt',
    input: {
      userId: USER_ID,
      debtAllocation: 1200,
      debts: [
        {
          account_id: 'acc_visa',
          name: 'Chase Visa',
          institution_name: 'Chase',
          type: 'credit_card',
          current_balance: 200,
          interest_rate: 0.2499,
          minimum_payment: 50,
          next_payment_due_date: '2026-05-01',
        },
        {
          account_id: 'acc_amex',
          name: 'Amex',
          institution_name: 'American Express',
          type: 'credit_card',
          current_balance: 8000,
          interest_rate: 0.1899,
          minimum_payment: 200,
          next_payment_due_date: '2026-05-05',
        },
        {
          account_id: 'acc_student',
          name: 'Student Loan',
          institution_name: 'Sallie',
          type: 'student_loan',
          current_balance: 25000,
          interest_rate: 0.068,
          minimum_payment: 280,
          next_payment_due_date: '2026-05-15',
        },
      ],
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 5000)],
      holdings: [],
      liabilities: [],
      user: makeUser(),
    },
  },

  // Case 5: two debts with identical APR. Tests tie-breaking.
  {
    id: 'debt-two-equal-apr',
    name: 'Two debts with identical APR',
    description:
      'Two credit cards both at 19.99% APR. Tie-breaking is acceptable; ' +
      'the only constraint is the sum equals the allocation.',
    agentType: 'debt',
    input: {
      userId: USER_ID,
      debtAllocation: 600,
      debts: [
        {
          account_id: 'acc_visa',
          name: 'Visa',
          institution_name: 'Chase',
          type: 'credit_card',
          current_balance: 4000,
          interest_rate: 0.1999,
          minimum_payment: 100,
          next_payment_due_date: '2026-05-01',
        },
        {
          account_id: 'acc_mc',
          name: 'Mastercard',
          institution_name: 'Citi',
          type: 'credit_card',
          current_balance: 6000,
          interest_rate: 0.1999,
          minimum_payment: 150,
          next_payment_due_date: '2026-05-05',
        },
      ],
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 4000)],
      holdings: [],
      liabilities: [],
      user: makeUser(),
    },
  },
];
