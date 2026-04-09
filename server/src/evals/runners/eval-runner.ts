/**
 * @module runners/eval-runner
 * @description Generic eval runner. For a given case it installs per-case
 * service mock return values, invokes the agent N times, scores each run,
 * and aggregates the results. Mocking happens at the service layer so the
 * real tool wrappers / schemas / error handling run unchanged — only I/O
 * is short-circuited.
 *
 * Also exposes two small helpers: `writeResultsArtifact` (persists a run
 * artifact for historical comparison) and `summarize` (collapses a list
 * of case results into the top-level EvalSuiteResult summary shape).
 */

import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Mock } from 'vitest';

import type {
  AnyAgentOutput,
  EvalAgentType,
  EvalCase,
  EvalCaseResult,
  EvalSuiteResult,
  SingleRunScore,
} from '../eval.types.js';
import type { AgentInvokeResult } from '../../modules/agents/agents.types.js';
import { DEFAULT_RUNS_PER_CASE } from '../eval.config.js';
import { aggregateRuns } from './aggregator.js';

/**
 * Bag of vitest mock functions for the four service-layer functions the
 * agent tools call. The *.eval.ts entry files populate this with
 * `vi.mocked(...)` references after `vi.mock(...)`ing the modules.
 */
export interface ServiceMocks {
  getAccountsForUser: Mock;
  getLatestHoldings: Mock;
  getLiabilitiesForUser: Mock;
  getUserById: Mock;
}

/**
 * Returns a promise that resolves after the specified number of milliseconds.
 * Used to space out API calls within a case to avoid hitting rate limits.
 *
 * @param ms - Milliseconds to wait.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Runs a single eval case N times against a supplied invoke closure and
 * score function. The mocks are re-installed each iteration because the
 * tool wrappers may consume them destructively across calls. A 3-second
 * delay is inserted between iterations to stay within Anthropic's
 * per-minute rate limits.
 *
 * @param testCase - The eval case describing input + mockData.
 * @param mocks - Service-layer vitest mocks installed by the test file.
 * @param invoke - Closure that invokes the target agent with the case input.
 * @param score - Pure scoring function for the agent's output.
 * @param runsPerCase - How many times to run the case (default: EVAL_RUNS env var, then config value).
 * @param delayMs - Milliseconds to wait between iterations to avoid rate limits (default: 3000, pass 0 in unit tests).
 * @returns The aggregated EvalCaseResult across all runs.
 */
export async function runCase<TCase extends EvalCase>(
  testCase: TCase,
  mocks: ServiceMocks,
  invoke: (c: TCase) => Promise<AgentInvokeResult<AnyAgentOutput>>,
  score: (output: AnyAgentOutput, c: TCase) => Omit<SingleRunScore, 'durationMs'>,
  runsPerCase: number = Number(process.env.EVAL_RUNS) || DEFAULT_RUNS_PER_CASE,
  delayMs: number = 3000,
): Promise<EvalCaseResult> {
  const runs: SingleRunScore[] = [];

  for (let i = 0; i < runsPerCase; i++) {
    // Re-install per-case returns each iteration — the tool callbacks may
    // hold references or mutate returned arrays, and mockResolvedValue
    // only queues a single resolution.
    mocks.getAccountsForUser.mockResolvedValue(testCase.mockData.accounts);
    mocks.getLatestHoldings.mockResolvedValue(testCase.mockData.holdings);
    mocks.getLiabilitiesForUser.mockResolvedValue(testCase.mockData.liabilities);
    mocks.getUserById.mockResolvedValue(testCase.mockData.user);

    const start = performance.now();
    const result = await invoke(testCase);
    const durationMs = performance.now() - start;

    const single = score(result.output, testCase);
    runs.push({ ...single, durationMs });

    // Space out API calls to avoid hitting Anthropic's per-minute rate limit.
    if (i < runsPerCase - 1) {
      await sleep(delayMs);
    }
  }

  return aggregateRuns(testCase.id, testCase.name, testCase.agentType, runs);
}

/**
 * Writes a JSON artifact of the results for a given agent to
 * `src/evals/results/<agent>-<ISO-timestamp>.json`. Creates the directory
 * if missing. Intended for local historical comparison — not consumed by
 * any CI process.
 *
 * @param agent - Which agent these results are for.
 * @param results - The aggregated per-case results.
 * @returns The absolute path of the written artifact.
 */
export function writeResultsArtifact(
  agent: EvalAgentType,
  results: EvalCaseResult[],
): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const resultsDir = join(here, '..', 'results');
  mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = join(resultsDir, `${agent}-${timestamp}.json`);
  writeFileSync(filePath, JSON.stringify(results, null, 2), 'utf8');
  return filePath;
}

/**
 * Collapses a list of case results into the EvalSuiteResult summary shape.
 * The overall hard-constraint pass rate is the mean per-case overall pass
 * rate; the overall soft score is the mean per-case mean weighted soft score.
 *
 * @param results - All aggregated per-case results.
 * @returns The summary block of an EvalSuiteResult.
 */
export function summarize(results: EvalCaseResult[]): EvalSuiteResult['summary'] {
  const totalCases = results.length;
  const totalRuns = results.reduce((s, r) => s + r.runCount, 0);
  const overallHardConstraintPassRate =
    totalCases === 0
      ? 0
      : results.reduce((s, r) => s + r.overallPassRate, 0) / totalCases;
  const overallMeanSoftScore =
    totalCases === 0
      ? 0
      : results.reduce((s, r) => s + r.meanWeightedSoftScore, 0) / totalCases;
  return {
    totalCases,
    totalRuns,
    overallHardConstraintPassRate,
    overallMeanSoftScore,
  };
}
