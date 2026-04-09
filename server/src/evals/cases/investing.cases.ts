/**
 * @module cases/investing.cases
 * @description Eval case scenarios for the investing agent. Each case
 * targets a specific waterfall decision: 401k match capture, three-account
 * waterfall, near-retirement bond allocation, IRA-only path, null age.
 */

import type { InvestingEvalCase } from '../eval.types.js';
import { makeUser, makeChecking } from '../fixtures/mock-data.js';
import type { InvestmentAccount } from '../../modules/agents/agents.types.js';

const USER_ID = 'eval-user-01';

const ALL_THREE_ACCOUNTS: InvestmentAccount[] = [
  {
    account_id: 'acc_401k',
    name: 'Fidelity 401k',
    institution_name: 'Fidelity',
    type: '401k',
    current_balance: 50000,
    holdings: [
      { security_name: 'Vanguard Total Stock', ticker_symbol: 'VTSAX', quantity: 500, current_value: 50000 },
    ],
  },
  {
    account_id: 'acc_ira',
    name: 'Schwab Roth IRA',
    institution_name: 'Schwab',
    type: 'ira',
    current_balance: 20000,
    holdings: [
      { security_name: 'Schwab Total Stock', ticker_symbol: 'SWTSX', quantity: 200, current_value: 20000 },
    ],
  },
  {
    account_id: 'acc_brk',
    name: 'Schwab Brokerage',
    institution_name: 'Schwab',
    type: 'brokerage',
    current_balance: 10000,
    holdings: [
      { security_name: 'Vanguard Total Market', ticker_symbol: 'VTI', quantity: 50, current_value: 10000 },
    ],
  },
];

/** All investing eval cases. */
export const investingCases: InvestingEvalCase[] = [
  // Case 1: young user, 401k only. All money to the 401k.
  {
    id: 'invest-young-401k-only',
    name: 'Young user with only a 401k',
    description:
      'Age 25 with only a 401k account. $500/mo allocation. All goes to 401k. ' +
      'Bond allocation should be 0% (age < 30).',
    agentType: 'investing',
    input: {
      userId: USER_ID,
      investingAllocation: 500,
      accounts: [
        {
          account_id: 'acc_401k',
          name: 'Fidelity 401k',
          institution_name: 'Fidelity',
          type: '401k',
          current_balance: 5000,
          holdings: [
            { security_name: 'Total Stock', ticker_symbol: 'FXAIX', quantity: 50, current_value: 5000 },
          ],
        },
      ],
      userAge: 25,
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 4000)],
      holdings: [],
      liabilities: [],
      user: makeUser({ birthday: '2000-01-01' }),
    },
  },

  // Case 2: mid-career, three accounts, full waterfall.
  {
    id: 'invest-mid-career-waterfall',
    name: 'Mid-career three-account waterfall',
    description:
      'Age 40 with 401k, IRA, and brokerage. $2000/mo allocation. Should ' +
      'flow 401k match -> IRA -> additional 401k -> brokerage. Bond ratio ~10%.',
    agentType: 'investing',
    input: {
      userId: USER_ID,
      investingAllocation: 2000,
      accounts: ALL_THREE_ACCOUNTS,
      userAge: 40,
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 6000)],
      holdings: [],
      liabilities: [],
      user: makeUser({ birthday: '1986-01-01' }),
    },
  },

  // Case 3: near retirement, conservative bond tilt.
  {
    id: 'invest-near-retirement',
    name: 'Near-retirement conservative tilt',
    description:
      'Age 55 with three accounts. $3000/mo allocation. Bond allocation ' +
      'should be approximately 25%. 5 years to retirement.',
    agentType: 'investing',
    input: {
      userId: USER_ID,
      investingAllocation: 3000,
      accounts: ALL_THREE_ACCOUNTS,
      userAge: 55,
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 8000)],
      holdings: [],
      liabilities: [],
      user: makeUser({ birthday: '1971-01-01' }),
    },
  },

  // Case 4: no 401k, only IRA + brokerage.
  {
    id: 'invest-no-401k',
    name: 'No 401k, only IRA and brokerage',
    description:
      'Age 30 with only an IRA and a brokerage. $1000/mo allocation. Should ' +
      'fill IRA first, then brokerage.',
    agentType: 'investing',
    input: {
      userId: USER_ID,
      investingAllocation: 1000,
      accounts: [
        {
          account_id: 'acc_ira',
          name: 'Schwab IRA',
          institution_name: 'Schwab',
          type: 'ira',
          current_balance: 8000,
          holdings: [
            { security_name: 'Total Stock', ticker_symbol: 'SWTSX', quantity: 80, current_value: 8000 },
          ],
        },
        {
          account_id: 'acc_brk',
          name: 'Schwab Brokerage',
          institution_name: 'Schwab',
          type: 'brokerage',
          current_balance: 3000,
          holdings: [
            { security_name: 'Total Market', ticker_symbol: 'VTI', quantity: 15, current_value: 3000 },
          ],
        },
      ],
      userAge: 30,
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 4000)],
      holdings: [],
      liabilities: [],
      user: makeUser({ birthday: '1996-01-01' }),
    },
  },

  // Case 5: small allocation. Should not split tiny amounts across many accounts.
  {
    id: 'invest-small-allocation',
    name: 'Tiny allocation',
    description:
      'Age 35 with all three accounts and a $100/mo allocation. Should ' +
      'allocate to a single highest-priority account, not split into ' +
      'meaningless fractions.',
    agentType: 'investing',
    input: {
      userId: USER_ID,
      investingAllocation: 100,
      accounts: ALL_THREE_ACCOUNTS,
      userAge: 35,
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 3000)],
      holdings: [],
      liabilities: [],
      user: makeUser({ birthday: '1991-01-01' }),
    },
  },

  // Case 6: null age. Tests robustness.
  {
    id: 'invest-unknown-age',
    name: 'Unknown user age',
    description:
      'User has not set a birthday so age is null. Agent should still ' +
      'produce a valid plan and projection (with a default assumption).',
    agentType: 'investing',
    input: {
      userId: USER_ID,
      investingAllocation: 800,
      accounts: ALL_THREE_ACCOUNTS,
      userAge: null,
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 5000)],
      holdings: [],
      liabilities: [],
      user: makeUser({ birthday: undefined }),
    },
  },
];
