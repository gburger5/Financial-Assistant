/**
 * @module budget.scorer.test
 * @description Unit tests for the budget scorer. Verifies that hard
 * constraints fail loudly on broken outputs and that soft scores reward
 * outputs that align with the system prompt's allocation framework.
 *
 * Tests are written first per the TDD discipline in CLAUDE.md.
 */
import { describe, it, expect } from 'vitest';
import { scoreBudgetOutput } from '../budget.scorer.js';
import {
  makeBudget,
  makeChecking,
  makeSavings,
  makeCreditAccount,
  makeCreditLiability,
} from '../../fixtures/mock-data.js';
import type { BudgetEvalCase } from '../../eval.types.js';
import type { BudgetProposal } from '../../../modules/agents/core/tools.js';

// Helper: builds a budget proposal output. Defaults to a 50/30/20 split on
// $5000 income with no debt and a small investment.
function makeProposal(overrides: Partial<BudgetProposal> = {}): BudgetProposal {
  return {
    summary: 'Two short sentences. Plain text only here.',
    rationale: 'Two-sentence rationale that explains the chosen allocation.',
    income: 5000,
    housing: 1500,
    utilities: 200,
    transportation: 300,
    groceries: 500,
    takeout: 250,
    shopping: 200,
    personalCare: 100,
    emergencyFund: 500,
    entertainment: 200,
    medical: 50,
    debts: 0,
    investments: 1200,
    ...overrides,
  };
}

// Helper: builds a basic eval case with $5000 income, no debt, $20k savings.
function makeCase(
  inputBudgetOverrides: Partial<Parameters<typeof makeBudget>[0]> = {},
  mockOverrides: Partial<BudgetEvalCase['mockData']> = {},
): BudgetEvalCase {
  const baseAmounts = {
    income: 5000,
    housing: 1500,
    utilities: 200,
    transportation: 300,
    groceries: 500,
    takeout: 250,
    shopping: 200,
    personalCare: 100,
    emergencyFund: 0,
    entertainment: 200,
    medical: 50,
    debts: 0,
    investments: 1800,
  };
  return {
    id: 'budget-test',
    name: 'budget-test',
    description: 'test fixture',
    agentType: 'budget',
    input: {
      userId: 'eval-user-01',
      budget: makeBudget({ ...baseAmounts, ...inputBudgetOverrides }),
    },
    mockData: {
      accounts: [
        makeChecking('acc_chk', 3000),
        makeSavings('acc_sav', 20000),
      ],
      holdings: [],
      liabilities: [],
      user: {
        userId: 'eval-user-01',
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.c',
        createdAt: '2026-01-01T00:00:00.000Z',
        agentBudgetApproved: false,
        birthday: '1996-01-01',
      },
      ...mockOverrides,
    },
  };
}

describe('scoreBudgetOutput — hard constraints', () => {
  it('passes categories_sum_equals_income on a valid proposal', () => {
    const score = scoreBudgetOutput(makeProposal(), makeCase());
    const c = score.hardConstraints.find(c => c.name === 'categories_sum_equals_income');
    expect(c?.passed).toBe(true);
  });

  it('fails categories_sum_equals_income when sum exceeds income', () => {
    const score = scoreBudgetOutput(makeProposal({ housing: 2000 }), makeCase());
    const c = score.hardConstraints.find(c => c.name === 'categories_sum_equals_income');
    expect(c?.passed).toBe(false);
  });

  it('passes categories_sum_equals_income within $0.01 tolerance', () => {
    const score = scoreBudgetOutput(makeProposal({ investments: 1199.995 }), makeCase());
    // Sum is 5000 - 0.005 = 4999.995, within tolerance.
    const c = score.hardConstraints.find(c => c.name === 'categories_sum_equals_income');
    expect(c?.passed).toBe(true);
  });

  it('fails investments_nonzero when investments is zero', () => {
    const score = scoreBudgetOutput(
      makeProposal({ investments: 0, emergencyFund: 1700 }),
      makeCase(),
    );
    const c = score.hardConstraints.find(c => c.name === 'investments_nonzero');
    expect(c?.passed).toBe(false);
  });

  it('passes investments_nonzero for any positive investment', () => {
    const score = scoreBudgetOutput(makeProposal({ investments: 1 }), makeCase());
    const c = score.hardConstraints.find(c => c.name === 'investments_nonzero');
    // Note: must adjust another field to keep sum valid; do this directly.
    const valid = scoreBudgetOutput(
      makeProposal({ investments: 1, emergencyFund: 1699 }),
      makeCase(),
    );
    expect(valid.hardConstraints.find(c => c.name === 'investments_nonzero')?.passed).toBe(true);
  });

  it('fails debts_gte_min_payments when debts allocation is below sum of minimum payments', () => {
    const proposal = makeProposal({
      debts: 50,           // below the $200 minimum
      investments: 1150,
    });
    const c = makeCase({}, {
      liabilities: [makeCreditLiability('acc_cc', 24.99, 200)],
    });
    const score = scoreBudgetOutput(proposal, c);
    const r = score.hardConstraints.find(c => c.name === 'debts_gte_min_payments');
    expect(r?.passed).toBe(false);
  });

  it('passes debts_gte_min_payments when there are no liabilities', () => {
    const score = scoreBudgetOutput(makeProposal(), makeCase());
    const r = score.hardConstraints.find(c => c.name === 'debts_gte_min_payments');
    expect(r?.passed).toBe(true);
  });

  it('passes debts_gte_min_payments when debts >= sum of minimums', () => {
    const proposal = makeProposal({ debts: 250, investments: 950 });
    const c = makeCase({}, {
      liabilities: [makeCreditLiability('acc_cc', 24.99, 200)],
    });
    const score = scoreBudgetOutput(proposal, c);
    expect(
      score.hardConstraints.find(c => c.name === 'debts_gte_min_payments')?.passed,
    ).toBe(true);
  });

  it('fails all_categories_nonnegative when any field is negative', () => {
    const score = scoreBudgetOutput(
      makeProposal({ shopping: -100, investments: 1300 }),
      makeCase(),
    );
    const r = score.hardConstraints.find(c => c.name === 'all_categories_nonnegative');
    expect(r?.passed).toBe(false);
  });

  it('fails income_matches_input when output income differs from input', () => {
    const score = scoreBudgetOutput(makeProposal({ income: 6000 }), makeCase());
    const r = score.hardConstraints.find(c => c.name === 'income_matches_input');
    expect(r?.passed).toBe(false);
  });

  it('passes income_matches_input when amounts agree', () => {
    const score = scoreBudgetOutput(makeProposal(), makeCase());
    const r = score.hardConstraints.find(c => c.name === 'income_matches_input');
    expect(r?.passed).toBe(true);
  });

  it('fails needs_not_reduced_below_actual when housing is cut below actual', () => {
    const score = scoreBudgetOutput(
      makeProposal({ housing: 1000, investments: 1700 }),
      // Actual housing is 1500 in the input budget; 1000 is a 33% cut.
      makeCase(),
    );
    const r = score.hardConstraints.find(c => c.name === 'needs_not_reduced_below_actual');
    expect(r?.passed).toBe(false);
  });

  it('passes needs_not_reduced_below_actual within 5% tolerance', () => {
    const score = scoreBudgetOutput(
      makeProposal({ housing: 1430, investments: 1270 }),
      // 1430 is ~4.7% below 1500, within tolerance.
      makeCase(),
    );
    const r = score.hardConstraints.find(c => c.name === 'needs_not_reduced_below_actual');
    expect(r?.passed).toBe(true);
  });

  it('reports allHardConstraintsPassed=true on a fully valid proposal', () => {
    const score = scoreBudgetOutput(makeProposal(), makeCase());
    expect(score.allHardConstraintsPassed).toBe(true);
  });

  it('reports allHardConstraintsPassed=false when any constraint fails', () => {
    const score = scoreBudgetOutput(
      makeProposal({ income: 9999 }),
      makeCase(),
    );
    expect(score.allHardConstraintsPassed).toBe(false);
  });
});

describe('scoreBudgetOutput — soft scores', () => {
  it('returns a 50/30/20 adherence score', () => {
    const score = scoreBudgetOutput(makeProposal(), makeCase());
    const s = score.softScores.find(s => s.name === 'fifty_thirty_twenty_adherence');
    expect(s).toBeDefined();
    expect(s!.score).toBeGreaterThan(0.5);
  });

  it('emergency fund tier compliance: passes when ef contribution within cap', () => {
    // Savings $20k vs income $5k -> 4x income -> tier "<6x", cap = 10% income = $500.
    const score = scoreBudgetOutput(makeProposal({ emergencyFund: 500 }), makeCase());
    const s = score.softScores.find(s => s.name === 'emergency_fund_tier_compliance');
    expect(s?.score).toBe(1.0);
  });

  it('emergency fund tier compliance: fails when ef contribution exceeds cap', () => {
    // Same case, but ef = $1500 (30%), exceeds the 10% cap.
    const score = scoreBudgetOutput(
      makeProposal({ emergencyFund: 1500, investments: 200 }),
      makeCase(),
    );
    const s = score.softScores.find(s => s.name === 'emergency_fund_tier_compliance');
    expect(s?.score).toBe(0);
  });

  it('debt prioritization: rewards debts > investments when high APR debt exists', () => {
    const proposal = makeProposal({ debts: 800, investments: 400 });
    const c = makeCase({}, {
      liabilities: [makeCreditLiability('acc_cc', 24.99, 200)],
    });
    const score = scoreBudgetOutput(proposal, c);
    const s = score.softScores.find(s => s.name === 'debt_prioritized_when_high_apr');
    expect(s?.score).toBe(1.0);
  });

  it('debt prioritization: scores 0 when investments > debts despite high APR debt', () => {
    const proposal = makeProposal({ debts: 200, investments: 1000 });
    const c = makeCase({}, {
      liabilities: [makeCreditLiability('acc_cc', 24.99, 200)],
    });
    const score = scoreBudgetOutput(proposal, c);
    const s = score.softScores.find(s => s.name === 'debt_prioritized_when_high_apr');
    expect(s?.score).toBe(0);
  });

  it('debt prioritization: scores 1.0 (vacuous) when no high-APR debt exists', () => {
    const score = scoreBudgetOutput(makeProposal(), makeCase());
    const s = score.softScores.find(s => s.name === 'debt_prioritized_when_high_apr');
    expect(s?.score).toBe(1.0);
  });

  it('summary quality: scores 1.0 for plain 2-sentence summary', () => {
    const score = scoreBudgetOutput(makeProposal(), makeCase());
    const s = score.softScores.find(s => s.name === 'summary_quality');
    expect(s?.score).toBe(1.0);
  });

  it('summary quality: scores 0 for summary with bullet points', () => {
    const score = scoreBudgetOutput(
      makeProposal({ summary: '- bullet one\n- bullet two' }),
      makeCase(),
    );
    const s = score.softScores.find(s => s.name === 'summary_quality');
    expect(s?.score).toBeLessThan(0.5);
  });

  it('summary quality: scores 0 for summary with all caps section', () => {
    const score = scoreBudgetOutput(
      makeProposal({ summary: 'IMPORTANT: spend less. Save more.' }),
      makeCase(),
    );
    const s = score.softScores.find(s => s.name === 'summary_quality');
    expect(s?.score).toBeLessThan(0.5);
  });

  it('reports a weightedSoftScore in [0, 1]', () => {
    const score = scoreBudgetOutput(makeProposal(), makeCase());
    expect(score.weightedSoftScore).toBeGreaterThanOrEqual(0);
    expect(score.weightedSoftScore).toBeLessThanOrEqual(1);
  });
});
