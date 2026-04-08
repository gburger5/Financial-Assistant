/**
 * @module debt.scorer.test
 * @description Unit tests for the debt scorer. Verifies hard constraints
 * derived from DEBT_SYSTEM_PROMPT and soft scores for avalanche ordering
 * and projection math accuracy.
 */
import { describe, it, expect } from 'vitest';
import { scoreDebtOutput } from '../debt.scorer.js';
import { makeUser, makeChecking } from '../../fixtures/mock-data.js';
import type { DebtEvalCase } from '../../eval.types.js';
import type { DebtPaymentPlan } from '../../../modules/agents/core/tools.js';
import type { DebtAccount } from '../../../modules/agents/agents.types.js';

const DEBTS: DebtAccount[] = [
  {
    account_id: 'acc_cc',
    name: 'Visa',
    institution_name: 'Chase',
    type: 'credit_card',
    current_balance: 5000,
    interest_rate: 0.2499,
    minimum_payment: 150,
    next_payment_due_date: '2026-05-01',
  },
  {
    account_id: 'acc_loan',
    name: 'Student Loan',
    institution_name: 'Sallie',
    type: 'student_loan',
    current_balance: 25000,
    interest_rate: 0.068,
    minimum_payment: 280,
    next_payment_due_date: '2026-05-15',
  },
  {
    account_id: 'acc_auto',
    name: 'Car Loan',
    institution_name: 'Honda',
    type: 'other',
    current_balance: 12000,
    interest_rate: 0.045,
    minimum_payment: 250,
    next_payment_due_date: '2026-05-10',
  },
];

function makeCase(debts: DebtAccount[] = DEBTS, allocation = 1000): DebtEvalCase {
  return {
    id: 'debt-test',
    name: 'debt-test',
    description: 'test fixture',
    agentType: 'debt',
    input: {
      userId: 'eval-user-01',
      debtAllocation: allocation,
      debts,
    },
    mockData: {
      accounts: [makeChecking('acc_chk', 5000)],
      holdings: [],
      liabilities: [],
      user: makeUser(),
    },
  };
}

function makePlan(overrides: Partial<DebtPaymentPlan> = {}): DebtPaymentPlan {
  return {
    summary: 'Two-sentence summary stating the dollar amounts. Plain text only.',
    rationale: 'Short rationale referencing the highest APR debt.',
    scheduled_payments: [
      { plaid_account_id: 'acc_cc', debt_name: 'Visa', amount: 470, payment_type: 'extra' },
      { plaid_account_id: 'acc_loan', debt_name: 'Student Loan', amount: 280, payment_type: 'minimum' },
      { plaid_account_id: 'acc_auto', debt_name: 'Car Loan', amount: 250, payment_type: 'minimum' },
    ],
    projections: [
      { plaid_account_id: 'acc_cc', debt_name: 'Visa', current_balance: 5000, apr: 0.2499, months_to_payoff: 12, total_interest_paid: 640 },
      { plaid_account_id: 'acc_loan', debt_name: 'Student Loan', current_balance: 25000, apr: 0.068, months_to_payoff: 110, total_interest_paid: 5800 },
      { plaid_account_id: 'acc_auto', debt_name: 'Car Loan', current_balance: 12000, apr: 0.045, months_to_payoff: 51, total_interest_paid: 750 },
    ],
    interest_savings: 1200,
    positive_outcomes: 'Visa paid off in one year frees $150/month.',
    ...overrides,
  };
}

describe('scoreDebtOutput — hard constraints', () => {
  it('passes payments_sum_equals_allocation when amounts add up', () => {
    const score = scoreDebtOutput(makePlan(), makeCase());
    expect(score.hardConstraints.find(c => c.name === 'payments_sum_equals_allocation')?.passed).toBe(true);
  });

  it('fails payments_sum_equals_allocation on a mismatch', () => {
    const plan = makePlan({
      scheduled_payments: [
        { plaid_account_id: 'acc_cc', debt_name: 'Visa', amount: 100, payment_type: 'minimum' },
      ],
    });
    expect(scoreDebtOutput(plan, makeCase()).hardConstraints.find(c => c.name === 'payments_sum_equals_allocation')?.passed).toBe(false);
  });

  it('fails all_debts_covered when one debt is missing', () => {
    const plan = makePlan({
      scheduled_payments: [
        { plaid_account_id: 'acc_cc', debt_name: 'Visa', amount: 750, payment_type: 'extra' },
        { plaid_account_id: 'acc_loan', debt_name: 'Student Loan', amount: 250, payment_type: 'minimum' },
      ],
    });
    expect(scoreDebtOutput(plan, makeCase()).hardConstraints.find(c => c.name === 'all_debts_covered')?.passed).toBe(false);
  });

  it('passes all_debts_covered when every debt has a payment', () => {
    expect(scoreDebtOutput(makePlan(), makeCase()).hardConstraints.find(c => c.name === 'all_debts_covered')?.passed).toBe(true);
  });

  it('fails minimums_met when a debt is paid below its minimum (and total allocation exceeds total minimums)', () => {
    const plan = makePlan({
      scheduled_payments: [
        { plaid_account_id: 'acc_cc', debt_name: 'Visa', amount: 600, payment_type: 'extra' },
        { plaid_account_id: 'acc_loan', debt_name: 'Student Loan', amount: 100, payment_type: 'minimum' },
        { plaid_account_id: 'acc_auto', debt_name: 'Car Loan', amount: 300, payment_type: 'minimum' },
      ],
    });
    expect(scoreDebtOutput(plan, makeCase()).hardConstraints.find(c => c.name === 'minimums_met')?.passed).toBe(false);
  });

  it('skips minimums_met when total allocation < total minimums (underfunded scenario)', () => {
    // Total minimums = 680, allocation = 500. The constraint is allowed to fail.
    const plan = makePlan({
      scheduled_payments: [
        { plaid_account_id: 'acc_cc', debt_name: 'Visa', amount: 150, payment_type: 'minimum' },
        { plaid_account_id: 'acc_loan', debt_name: 'Student Loan', amount: 100, payment_type: 'minimum' },
        { plaid_account_id: 'acc_auto', debt_name: 'Car Loan', amount: 250, payment_type: 'minimum' },
      ],
    });
    const score = scoreDebtOutput(plan, makeCase(DEBTS, 500));
    expect(score.hardConstraints.find(c => c.name === 'minimums_met')?.passed).toBe(true);
  });

  it('fails all_amounts_positive when an amount is zero or negative', () => {
    const plan = makePlan({
      scheduled_payments: [
        { plaid_account_id: 'acc_cc', debt_name: 'Visa', amount: 750, payment_type: 'extra' },
        { plaid_account_id: 'acc_loan', debt_name: 'Student Loan', amount: 280, payment_type: 'minimum' },
        { plaid_account_id: 'acc_auto', debt_name: 'Car Loan', amount: -30, payment_type: 'minimum' },
      ],
    });
    expect(scoreDebtOutput(plan, makeCase()).hardConstraints.find(c => c.name === 'all_amounts_positive')?.passed).toBe(false);
  });

  it('fails account_ids_valid when a payment references an unknown account', () => {
    const plan = makePlan({
      scheduled_payments: [
        { plaid_account_id: 'acc_unknown', debt_name: 'Phantom', amount: 1000, payment_type: 'extra' },
      ],
    });
    expect(scoreDebtOutput(plan, makeCase()).hardConstraints.find(c => c.name === 'account_ids_valid')?.passed).toBe(false);
  });

  it('fails projections_for_all_debts when a debt is missing from projections', () => {
    const plan = makePlan({
      projections: [
        { plaid_account_id: 'acc_cc', debt_name: 'Visa', current_balance: 5000, apr: 0.2499, months_to_payoff: 12, total_interest_paid: 640 },
      ],
    });
    expect(scoreDebtOutput(plan, makeCase()).hardConstraints.find(c => c.name === 'projections_for_all_debts')?.passed).toBe(false);
  });
});

describe('scoreDebtOutput — soft scores', () => {
  it('avalanche_ordering scores 1.0 when surplus goes to highest APR', () => {
    const score = scoreDebtOutput(makePlan(), makeCase());
    expect(score.softScores.find(s => s.name === 'avalanche_ordering')?.score).toBe(1.0);
  });

  it('avalanche_ordering scores low when surplus goes to lowest APR', () => {
    const plan = makePlan({
      scheduled_payments: [
        { plaid_account_id: 'acc_cc', debt_name: 'Visa', amount: 150, payment_type: 'minimum' },
        { plaid_account_id: 'acc_loan', debt_name: 'Student Loan', amount: 280, payment_type: 'minimum' },
        { plaid_account_id: 'acc_auto', debt_name: 'Car Loan', amount: 570, payment_type: 'extra' },
      ],
    });
    expect(scoreDebtOutput(plan, makeCase()).softScores.find(s => s.name === 'avalanche_ordering')?.score).toBeLessThan(0.5);
  });

  it('payment_type_accuracy scores 1.0 for correctly labeled payments', () => {
    expect(scoreDebtOutput(makePlan(), makeCase()).softScores.find(s => s.name === 'payment_type_accuracy')?.score).toBe(1.0);
  });

  it('payment_type_accuracy scores below 1.0 when a label is wrong', () => {
    const plan = makePlan({
      scheduled_payments: [
        // Visa paid extra but labeled as minimum.
        { plaid_account_id: 'acc_cc', debt_name: 'Visa', amount: 470, payment_type: 'minimum' },
        { plaid_account_id: 'acc_loan', debt_name: 'Student Loan', amount: 280, payment_type: 'minimum' },
        { plaid_account_id: 'acc_auto', debt_name: 'Car Loan', amount: 250, payment_type: 'minimum' },
      ],
    });
    expect(scoreDebtOutput(plan, makeCase()).softScores.find(s => s.name === 'payment_type_accuracy')?.score).toBeLessThan(1.0);
  });

  it('interest_savings_plausible scores 1.0 when savings > 0 with surplus', () => {
    expect(scoreDebtOutput(makePlan(), makeCase()).softScores.find(s => s.name === 'interest_savings_plausible')?.score).toBe(1.0);
  });

  it('interest_savings_plausible scores 0 when savings <= 0 with surplus', () => {
    expect(scoreDebtOutput(makePlan({ interest_savings: 0 }), makeCase()).softScores.find(s => s.name === 'interest_savings_plausible')?.score).toBe(0);
  });

  it('summary_quality flags ALL CAPS', () => {
    expect(scoreDebtOutput(makePlan({ summary: 'AVALANCHE STRATEGY APPLIED.' }), makeCase()).softScores.find(s => s.name === 'summary_quality')?.score).toBeLessThan(0.5);
  });
});
