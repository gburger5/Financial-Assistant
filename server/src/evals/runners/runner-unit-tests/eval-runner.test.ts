/**
 * @module eval-runner.test
 * @description Unit tests for the generic eval runner. The runner installs
 * per-case service mock returns, invokes the agent N times, scores each run,
 * and aggregates. These tests use fake invoke/score closures so no real
 * Anthropic API calls are made.
 */
import { describe, it, expect, vi } from 'vitest';
import { runCase, type ServiceMocks } from '../eval-runner.js';
import type {
  BudgetEvalCase,
  SingleRunScore,
} from '../../eval.types.js';

function makeMocks(): ServiceMocks {
  return {
    getAccountsForUser: vi.fn(),
    getLatestHoldings: vi.fn(),
    getLiabilitiesForUser: vi.fn(),
    getUserById: vi.fn(),
  };
}

const fakeCase: BudgetEvalCase = {
  id: 'c1',
  name: 'Case 1',
  description: '',
  agentType: 'budget',
  input: { userId: 'u1', budget: {} as never },
  mockData: {
    accounts: [{ id: 'a' } as never],
    holdings: [{ id: 'h' } as never],
    liabilities: [{ id: 'l' } as never],
    user: { userId: 'u1' } as never,
  },
};

const fakeSingleRun: Omit<SingleRunScore, 'durationMs'> = {
  hardConstraints: [{ name: 'h1', passed: true, detail: '' }],
  softScores: [{ name: 's1', score: 0.8, weight: 1, detail: '' }],
  allHardConstraintsPassed: true,
  weightedSoftScore: 0.8,
  rawOutput: {},
};

describe('runCase', () => {
  it('invokes the agent runsPerCase times', async () => {
    const mocks = makeMocks();
    const invoke = vi.fn().mockResolvedValue({ output: {}, metrics: {} });
    const score = vi.fn().mockReturnValue(fakeSingleRun);
    await runCase(fakeCase, mocks, invoke, score, 4, 0);
    expect(invoke).toHaveBeenCalledTimes(4);
    expect(score).toHaveBeenCalledTimes(4);
  });

  it('installs mock return values from the eval case before each invocation', async () => {
    const mocks = makeMocks();
    const invoke = vi.fn().mockResolvedValue({ output: {}, metrics: {} });
    const score = vi.fn().mockReturnValue(fakeSingleRun);
    await runCase(fakeCase, mocks, invoke, score, 1, 0);
    await expect(mocks.getAccountsForUser('u1')).resolves.toEqual(fakeCase.mockData.accounts);
    await expect(mocks.getLatestHoldings('u1')).resolves.toEqual(fakeCase.mockData.holdings);
    await expect(mocks.getLiabilitiesForUser('u1')).resolves.toEqual(fakeCase.mockData.liabilities);
    await expect(mocks.getUserById('u1')).resolves.toEqual(fakeCase.mockData.user);
  });

  it('returns an aggregated EvalCaseResult with the case identity', async () => {
    const mocks = makeMocks();
    const invoke = vi.fn().mockResolvedValue({ output: {}, metrics: {} });
    const score = vi.fn().mockReturnValue(fakeSingleRun);
    const result = await runCase(fakeCase, mocks, invoke, score, 3, 0);
    expect(result.caseId).toBe('c1');
    expect(result.caseName).toBe('Case 1');
    expect(result.agentType).toBe('budget');
    expect(result.runCount).toBe(3);
    expect(result.overallPassRate).toBe(1);
    expect(result.meanWeightedSoftScore).toBeCloseTo(0.8);
  });

  it('measures wall-clock duration on each run', async () => {
    const mocks = makeMocks();
    const invoke = vi.fn().mockResolvedValue({ output: {}, metrics: {} });
    const score = vi.fn().mockReturnValue(fakeSingleRun);
    const result = await runCase(fakeCase, mocks, invoke, score, 2, 0);
    for (const run of result.runs) {
      expect(typeof run.durationMs).toBe('number');
      expect(run.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('passes the agent output to the score function', async () => {
    const mocks = makeMocks();
    const output = { hello: 'world' };
    const invoke = vi.fn().mockResolvedValue({ output, metrics: {} });
    const score = vi.fn().mockReturnValue(fakeSingleRun);
    await runCase(fakeCase, mocks, invoke, score, 1, 0);
    expect(score).toHaveBeenCalledWith(output, fakeCase);
  });
});
