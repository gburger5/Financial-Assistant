/**
 * @module budget.eval
 * @description Vitest entry point for the budget agent eval suite. Runs the
 * real budget agent (real Anthropic API calls) against every case in
 * `budgetCases`, scoring each run with `scoreBudgetOutput`. The four
 * service-layer functions the agent tools depend on are mocked so no
 * real DB / Plaid I/O occurs.
 *
 * This file is only picked up by `vitest.eval.config.ts` — it is excluded
 * from the regular `npm test` path by the root config's include pattern.
 */
import { describe, it, expect, vi, afterAll } from 'vitest';

// Service-layer mocks — installed before any agent / tool module is imported
// so the tool callbacks see the mocked functions, not the real ones.
vi.mock('../../modules/accounts/accounts.service.js', () => ({
  getAccountsForUser: vi.fn(),
}));
vi.mock('../../modules/investments/investments.service.js', () => ({
  getLatestHoldings: vi.fn(),
}));
vi.mock('../../modules/liabilities/liabilities.service.js', () => ({
  getLiabilitiesForUser: vi.fn(),
}));
vi.mock('../../modules/auth/auth.service.js', () => ({
  getUserById: vi.fn(),
}));

import { getAccountsForUser } from '../../modules/accounts/accounts.service.js';
import { getLatestHoldings } from '../../modules/investments/investments.service.js';
import { getLiabilitiesForUser } from '../../modules/liabilities/liabilities.service.js';
import { getUserById } from '../../modules/auth/auth.service.js';

import { invokeBudgetAgent } from '../../modules/agents/core/budget-agent.js';
import { scoreBudgetOutput } from '../scoring/budget.scorer.js';
import { budgetCases } from '../cases/budget.cases.js';
import { runCase, writeResultsArtifact, type ServiceMocks } from './eval-runner.js';
import { HARD_CONSTRAINT_PASS_THRESHOLD } from '../eval.config.js';
import type { BudgetProposal } from '../../modules/agents/core/tools.js';
import type { EvalCaseResult } from '../eval.types.js';

const mocks: ServiceMocks = {
  getAccountsForUser: vi.mocked(getAccountsForUser),
  getLatestHoldings: vi.mocked(getLatestHoldings),
  getLiabilitiesForUser: vi.mocked(getLiabilitiesForUser),
  getUserById: vi.mocked(getUserById),
};

describe('budget agent eval', () => {
  const allResults: EvalCaseResult[] = [];

  for (const testCase of budgetCases) {
    it(testCase.name, async () => {
      const result = await runCase(
        testCase,
        mocks,
        c => invokeBudgetAgent(c.input.userId, c.input.budget),
        (output, c) => scoreBudgetOutput(output as BudgetProposal, c),
      );
      allResults.push(result);
      expect(result.overallPassRate).toBeGreaterThanOrEqual(
        HARD_CONSTRAINT_PASS_THRESHOLD,
      );
    });
  }

  afterAll(() => {
    if (allResults.length === 0) return;
    writeResultsArtifact('budget', allResults);
    // eslint-disable-next-line no-console
    console.table(
      allResults.map(r => ({
        case: r.caseName,
        hardPass: r.overallPassRate,
        softMean: r.meanWeightedSoftScore.toFixed(2),
        medMs: r.medianDurationMs.toFixed(0),
      })),
    );
  });
});
