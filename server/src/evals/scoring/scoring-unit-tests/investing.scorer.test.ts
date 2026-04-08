/**
 * @module investing.scorer.test
 * @description Unit tests for the investing scorer. Verifies hard constraints
 * derived from INVESTING_SYSTEM_PROMPT and soft scores for account priority
 * waterfall, three-fund bond ratio, and projection math.
 */
import { describe, it, expect } from 'vitest';
import { scoreInvestingOutput } from '../investing.scorer.js';
import { makeUser, makeChecking } from '../../fixtures/mock-data.js';
import type { InvestingEvalCase } from '../../eval.types.js';
import type { InvestmentPlan } from '../../../modules/agents/core/tools.js';
import type { InvestmentAccount } from '../../../modules/agents/agents.types.js';

const ACCOUNTS: InvestmentAccount[] = [
  {
    account_id: 'acc_401k',
    name: 'Fidelity 401k',
    institution_name: 'Fidelity',
    type: '401k',
    current_balance: 50000,
    holdings: [{ security_name: 'Total Market', ticker_symbol: 'FXAIX', quantity: 100, current_value: 50000 }],
  },
  {
    account_id: 'acc_ira',
    name: 'Schwab Roth IRA',
    institution_name: 'Schwab',
    type: 'ira',
    current_balance: 20000,
    holdings: [{ security_name: 'Total Stock', ticker_symbol: 'SWTSX', quantity: 200, current_value: 20000 }],
  },
  {
    account_id: 'acc_brk',
    name: 'Brokerage',
    institution_name: 'Schwab',
    type: 'brokerage',
    current_balance: 10000,
    holdings: [{ security_name: 'Total Market', ticker_symbol: 'VTI', quantity: 50, current_value: 10000 }],
  },
];

function makeCase(
  overrides: Partial<{ allocation: number; age: number | null; accounts: InvestmentAccount[] }> = {},
): InvestingEvalCase {
  return {
    id: 'invest-test',
    name: 'invest-test',
    description: 'test fixture',
    agentType: 'investing',
    input: {
      userId: 'eval-user-01',
      investingAllocation: overrides.allocation ?? 1000,
      accounts: overrides.accounts ?? ACCOUNTS,
      userAge: overrides.age ?? 30,
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 5000)],
      holdings: [],
      liabilities: [],
      user: makeUser({ birthday: '1996-01-01' }),
    },
  };
}

function makePlan(overrides: Partial<InvestmentPlan> = {}): InvestmentPlan {
  return {
    summary: 'Two-sentence summary mentioning the dollar amounts. Plain text.',
    rationale: 'Short rationale referencing age and account priority.',
    scheduled_contributions: [
      { plaid_account_id: 'acc_401k', account_name: 'Fidelity 401k', amount: 400, contribution_type: '401k', fund_ticker: 'FXAIX', fund_name: 'Total Market' },
      { plaid_account_id: 'acc_ira', account_name: 'Schwab Roth IRA', amount: 583, contribution_type: 'roth_ira', fund_ticker: 'SWTSX', fund_name: 'Total Stock' },
      { plaid_account_id: 'acc_brk', account_name: 'Brokerage', amount: 17, contribution_type: 'brokerage', fund_ticker: 'VTI', fund_name: 'Total Market' },
    ],
    projections: {
      retirement_age: 60,
      years_to_retirement: 30,
      assumed_annual_return: 0.07,
      total_projected_contributions: 360000,
      total_projected_growth: 815000,
      total_at_retirement: 1175000,
      holdings: [
        { fund_ticker: 'FXAIX', fund_name: 'Total Market', current_value: 50000, projected_value_at_retirement: 380000 },
        { fund_ticker: 'SWTSX', fund_name: 'Total Stock', current_value: 20000, projected_value_at_retirement: 152000 },
        { fund_ticker: 'VTI', fund_name: 'Total Market', current_value: 10000, projected_value_at_retirement: 76000 },
      ],
    },
    positive_outcome: 'At this rate you will have over a million dollars by age 60.',
    ...overrides,
  };
}

describe('scoreInvestingOutput — hard constraints', () => {
  it('passes contributions_sum_equals_allocation when sum matches', () => {
    expect(scoreInvestingOutput(makePlan(), makeCase()).hardConstraints.find(c => c.name === 'contributions_sum_equals_allocation')?.passed).toBe(true);
  });

  it('fails contributions_sum_equals_allocation on a mismatch', () => {
    const plan = makePlan({
      scheduled_contributions: [
        { plaid_account_id: 'acc_401k', account_name: '401k', amount: 500, contribution_type: '401k', fund_ticker: null, fund_name: null },
      ],
    });
    expect(scoreInvestingOutput(plan, makeCase()).hardConstraints.find(c => c.name === 'contributions_sum_equals_allocation')?.passed).toBe(false);
  });

  it('fails all_amounts_positive when an amount is zero', () => {
    const plan = makePlan({
      scheduled_contributions: [
        { plaid_account_id: 'acc_401k', account_name: '401k', amount: 1000, contribution_type: '401k', fund_ticker: null, fund_name: null },
        { plaid_account_id: 'acc_ira', account_name: 'IRA', amount: 0, contribution_type: 'roth_ira', fund_ticker: null, fund_name: null },
      ],
    });
    expect(scoreInvestingOutput(plan, makeCase()).hardConstraints.find(c => c.name === 'all_amounts_positive')?.passed).toBe(false);
  });

  it('fails account_ids_valid for unknown account ids', () => {
    const plan = makePlan({
      scheduled_contributions: [
        { plaid_account_id: 'acc_unknown', account_name: '?', amount: 1000, contribution_type: '401k', fund_ticker: null, fund_name: null },
      ],
    });
    expect(scoreInvestingOutput(plan, makeCase()).hardConstraints.find(c => c.name === 'account_ids_valid')?.passed).toBe(false);
  });

  it('fails retirement_age_is_60 when set to something else', () => {
    const plan = makePlan({
      projections: { ...makePlan().projections, retirement_age: 65 },
    });
    expect(scoreInvestingOutput(plan, makeCase()).hardConstraints.find(c => c.name === 'retirement_age_is_60')?.passed).toBe(false);
  });

  it('fails assumed_return_is_seven_percent when off', () => {
    const plan = makePlan({
      projections: { ...makePlan().projections, assumed_annual_return: 0.10 },
    });
    expect(scoreInvestingOutput(plan, makeCase()).hardConstraints.find(c => c.name === 'assumed_return_is_seven_percent')?.passed).toBe(false);
  });

  it('passes years_to_retirement_correct when matching age', () => {
    expect(scoreInvestingOutput(makePlan(), makeCase({ age: 30 })).hardConstraints.find(c => c.name === 'years_to_retirement_correct')?.passed).toBe(true);
  });

  it('fails years_to_retirement_correct when off by more than 1', () => {
    expect(scoreInvestingOutput(makePlan(), makeCase({ age: 25 })).hardConstraints.find(c => c.name === 'years_to_retirement_correct')?.passed).toBe(false);
  });

  it('skips years_to_retirement_correct when age is null (vacuous pass)', () => {
    expect(scoreInvestingOutput(makePlan(), makeCase({ age: null })).hardConstraints.find(c => c.name === 'years_to_retirement_correct')?.passed).toBe(true);
  });
});

describe('scoreInvestingOutput — soft scores', () => {
  it('account_priority scores 1.0 for proper waterfall (401k -> IRA -> brokerage)', () => {
    expect(scoreInvestingOutput(makePlan(), makeCase()).softScores.find(s => s.name === 'account_priority_order')?.score).toBeGreaterThan(0.5);
  });

  it('account_priority scores low when brokerage gets the most despite IRA room', () => {
    const plan = makePlan({
      scheduled_contributions: [
        { plaid_account_id: 'acc_brk', account_name: 'Brokerage', amount: 800, contribution_type: 'brokerage', fund_ticker: null, fund_name: null },
        { plaid_account_id: 'acc_ira', account_name: 'IRA', amount: 100, contribution_type: 'roth_ira', fund_ticker: null, fund_name: null },
        { plaid_account_id: 'acc_401k', account_name: '401k', amount: 100, contribution_type: '401k', fund_ticker: null, fund_name: null },
      ],
    });
    expect(scoreInvestingOutput(plan, makeCase()).softScores.find(s => s.name === 'account_priority_order')?.score).toBeLessThan(0.5);
  });

  it('three_fund_bond_ratio: scores 1.0 at age 30 (0% bonds)', () => {
    // Default holdings have no bond fund -> bond ratio is ~0.
    expect(scoreInvestingOutput(makePlan(), makeCase({ age: 30 })).softScores.find(s => s.name === 'three_fund_bond_ratio')?.score).toBeGreaterThan(0.8);
  });

  it('projection_math_accuracy: scores 1.0 when totals are consistent', () => {
    expect(scoreInvestingOutput(makePlan(), makeCase()).softScores.find(s => s.name === 'projection_math_accuracy')?.score).toBe(1.0);
  });

  it('projection_math_accuracy: scores low when total contributions wildly off', () => {
    const plan = makePlan({
      projections: { ...makePlan().projections, total_projected_contributions: 50 },
    });
    expect(scoreInvestingOutput(plan, makeCase()).softScores.find(s => s.name === 'projection_math_accuracy')?.score).toBeLessThan(1.0);
  });

  it('contribution_type_accuracy: scores 1.0 when types match account types', () => {
    expect(scoreInvestingOutput(makePlan(), makeCase()).softScores.find(s => s.name === 'contribution_type_accuracy')?.score).toBe(1.0);
  });

  it('contribution_type_accuracy: scores below 1.0 when type is wrong', () => {
    const plan = makePlan({
      scheduled_contributions: [
        { plaid_account_id: 'acc_401k', account_name: '401k', amount: 1000, contribution_type: 'brokerage', fund_ticker: null, fund_name: null },
      ],
    });
    expect(scoreInvestingOutput(plan, makeCase()).softScores.find(s => s.name === 'contribution_type_accuracy')?.score).toBeLessThan(1.0);
  });

  it('summary_quality flags bullets', () => {
    expect(scoreInvestingOutput(makePlan({ summary: '- bullet one\n- bullet two' }), makeCase()).softScores.find(s => s.name === 'summary_quality')?.score).toBeLessThan(0.5);
  });
});
