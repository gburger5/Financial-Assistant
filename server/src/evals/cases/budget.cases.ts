/**
 * @module cases/budget.cases
 * @description Eval case scenarios for the budget agent. Each case targets
 * a specific decision the prompt should handle correctly: high debt with
 * low savings, overspending wants, fully-funded emergency fund, etc.
 *
 * Cases are pure data — no logic — so they have no tests. The fixtures
 * they use are tested through the scorer unit tests.
 */

import type { BudgetEvalCase } from '../eval.types.js';
import {
  makeUser,
  makeBudget,
  makeChecking,
  makeSavings,
  makeCreditAccount,
  makeCreditLiability,
} from '../fixtures/mock-data.js';

const USER_ID = 'eval-user-01';

/** All budget eval cases. Exported as an array for the runner to iterate. */
export const budgetCases: BudgetEvalCase[] = [
  // Case 1: balanced no-debt user. Should preserve a healthy 50/30/20.
  {
    id: 'budget-balanced-no-debt',
    name: 'Balanced user with no debt',
    description:
      'User with $6000 income, no debt, and $10k in savings. Should maintain ' +
      'roughly 50/30/20 with nonzero investments.',
    agentType: 'budget',
    input: {
      userId: USER_ID,
      budget: makeBudget({
        income: 6000,
        housing: 1800,
        utilities: 200,
        transportation: 400,
        groceries: 600,
        takeout: 300,
        shopping: 300,
        personalCare: 100,
        emergencyFund: 0,
        entertainment: 300,
        medical: 100,
        debts: 0,
        investments: 1900,
      }),
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 4000), makeSavings('acc_sav', 10000)],
      holdings: [],
      liabilities: [],
      user: makeUser({ birthday: '1996-01-01' }),
    },
  },

  // Case 2: high debt, low savings. Tests rule "prioritize debt" and 30% EF cap.
  {
    id: 'budget-high-debt-low-savings',
    name: 'High debt, low savings',
    description:
      'User with $5000 income, $200/mo credit-card minimum at 24.99% APR, ' +
      'only $2000 in savings (under 3x income). Agent should allocate at least ' +
      'the minimum to debts, cap emergency fund at 30% of income, and still ' +
      'allocate something to investments.',
    agentType: 'budget',
    input: {
      userId: USER_ID,
      budget: makeBudget({
        income: 5000,
        housing: 1500,
        utilities: 200,
        transportation: 300,
        groceries: 500,
        takeout: 400,
        shopping: 300,
        personalCare: 100,
        emergencyFund: 0,
        entertainment: 300,
        medical: 100,
        debts: 200,
        investments: 1100,
      }),
    },
    mockData: {
      accounts: [
        makeChecking('acc_chk', 1500),
        makeSavings('acc_sav', 2000),
        makeCreditAccount('acc_cc', 5000, 10000),
      ],
      holdings: [],
      liabilities: [makeCreditLiability('acc_cc', 24.99, 200)],
      user: makeUser({ birthday: '1996-01-01' }),
    },
  },

  // Case 3: overspending on wants. Tests "redirect surplus from wants".
  {
    id: 'budget-overspending-wants',
    name: 'Overspending on wants',
    description:
      'User spending 60% on wants (takeout $500, shopping $800, ' +
      'entertainment $600). Agent should cut wants and redirect surplus to ' +
      'investments and emergency fund.',
    agentType: 'budget',
    input: {
      userId: USER_ID,
      budget: makeBudget({
        income: 5000,
        housing: 1200,
        utilities: 200,
        transportation: 300,
        groceries: 400,
        takeout: 500,
        shopping: 800,
        personalCare: 200,
        emergencyFund: 0,
        entertainment: 600,
        medical: 100,
        debts: 0,
        investments: 700,
      }),
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 3000), makeSavings('acc_sav', 8000)],
      holdings: [],
      liabilities: [],
      user: makeUser({ birthday: '1996-01-01' }),
    },
  },

  // Case 4: high income, zero current investments. Tests "always allocate to investments".
  {
    id: 'budget-high-income-no-investments',
    name: 'High income, zero current investments',
    description:
      'User with $12000 income and zero current investment allocation. ' +
      'Agent should allocate aggressively to investments.',
    agentType: 'budget',
    input: {
      userId: USER_ID,
      budget: makeBudget({
        income: 12000,
        housing: 3000,
        utilities: 300,
        transportation: 600,
        groceries: 800,
        takeout: 600,
        shopping: 800,
        personalCare: 200,
        emergencyFund: 0,
        entertainment: 500,
        medical: 200,
        debts: 0,
        investments: 0,
      }),
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 8000), makeSavings('acc_sav', 50000)],
      holdings: [],
      liabilities: [],
      user: makeUser({ birthday: '1991-01-01' }),
    },
  },

  // Case 5: emergency fund fully funded. Tests the 5% cap branch.
  {
    id: 'budget-emergency-fund-fully-funded',
    name: 'Emergency fund fully funded',
    description:
      'User with $5500 income and $40k savings (>6x income). Emergency ' +
      'fund contribution should be capped at 5% of income; surplus should ' +
      'flow to investments.',
    agentType: 'budget',
    input: {
      userId: USER_ID,
      budget: makeBudget({
        income: 5500,
        housing: 1600,
        utilities: 200,
        transportation: 350,
        groceries: 550,
        takeout: 300,
        shopping: 300,
        personalCare: 100,
        emergencyFund: 0,
        entertainment: 250,
        medical: 100,
        debts: 0,
        investments: 1750,
      }),
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 5000), makeSavings('acc_sav', 40000)],
      holdings: [],
      liabilities: [],
      user: makeUser({ birthday: '1990-01-01' }),
    },
  },

  // Case 6: minimal income. Tests "needs not reduced below actual" + nonzero investments.
  {
    id: 'budget-minimal-income',
    name: 'Minimal income with non-negotiable needs',
    description:
      'User with $2500 income where housing+utilities+groceries already ' +
      'consume $1500. Agent should not cut needs and must still allocate ' +
      'a nonzero amount to investments.',
    agentType: 'budget',
    input: {
      userId: USER_ID,
      budget: makeBudget({
        income: 2500,
        housing: 1200,
        utilities: 150,
        transportation: 200,
        groceries: 150,
        takeout: 150,
        shopping: 100,
        personalCare: 50,
        emergencyFund: 0,
        entertainment: 100,
        medical: 50,
        debts: 0,
        investments: 350,
      }),
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 800), makeSavings('acc_sav', 3000)],
      holdings: [],
      liabilities: [],
      user: makeUser({ birthday: '1996-01-01' }),
    },
  },
];
