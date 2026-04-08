/**
 * @module investing.eval
 * @description Vitest entry point for the investing agent eval suite. Runs
 * the real investing agent (real Anthropic API calls) against every case in
 * `investingCases`, scoring each run with `scoreInvestingOutput`.
 * Service-layer functions are mocked so no DB / Plaid I/O occurs.
 */
import { describe, it, expect, vi, afterAll } from 'vitest';

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

import { invokeInvestingAgent } from '../../modules/agents/core/investing-agent.js';
import { scoreInvestingOutput } from '../scoring/investing.scorer.js';
import { investingCases } from '../cases/investing.cases.js';
import { runCase, writeResultsArtifact, type ServiceMocks } from './eval-runner.js';
import { HARD_CONSTRAINT_PASS_THRESHOLD } from '../eval.config.js';
import type { InvestmentPlan } from '../../modules/agents/core/tools.js';
import type { EvalCaseResult } from '../eval.types.js';

const mocks: ServiceMocks = {
  getAccountsForUser: vi.mocked(getAccountsForUser),
  getLatestHoldings: vi.mocked(getLatestHoldings),
  getLiabilitiesForUser: vi.mocked(getLiabilitiesForUser),
  getUserById: vi.mocked(getUserById),
};

describe('investing agent eval', () => {
  const allResults: EvalCaseResult[] = [];

  for (const testCase of investingCases) {
    it(testCase.name, async () => {
      const result = await runCase(
        testCase,
        mocks,
        c => invokeInvestingAgent(c.input),
        (output, c) => scoreInvestingOutput(output as InvestmentPlan, c),
      );
      allResults.push(result);
      expect(result.overallPassRate).toBeGreaterThanOrEqual(
        HARD_CONSTRAINT_PASS_THRESHOLD,
      );
    });
  }

  afterAll(() => {
    if (allResults.length === 0) return;
    writeResultsArtifact('investing', allResults);
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
