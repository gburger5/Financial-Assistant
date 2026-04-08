/**
 * @module runners/aggregator
 * @description Collapses N SingleRunScore objects for one eval case into a
 * single EvalCaseResult. Pure logic — no I/O — so it can be unit tested
 * without spinning up agents or mocks.
 */

import type {
  EvalAgentType,
  EvalCaseResult,
  SingleRunScore,
  SoftScoreStats,
} from '../eval.types.js';

/**
 * Computes mean/min/max/stddev for a list of numbers. Population stddev
 * (divides by N, not N-1) so a single run deterministically yields 0.
 *
 * @param {number[]} values
 * @returns {SoftScoreStats}
 */
function computeStats(values: number[]): SoftScoreStats {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  return { mean, min, max, stddev };
}

/**
 * Computes the median of a list of numbers. Even-length arrays return the
 * average of the two middle values.
 *
 * @param {number[]} values
 * @returns {number}
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Aggregates N runs of one eval case into a single EvalCaseResult.
 *
 * @param {string} caseId
 * @param {string} caseName
 * @param {EvalAgentType} agentType
 * @param {SingleRunScore[]} runs
 * @returns {EvalCaseResult}
 */
export function aggregateRuns(
  caseId: string,
  caseName: string,
  agentType: EvalAgentType,
  runs: SingleRunScore[],
): EvalCaseResult {
  const runCount = runs.length;

  // Per-constraint pass rate.
  const hardByName: Record<string, { passed: number; total: number }> = {};
  for (const run of runs) {
    for (const hc of run.hardConstraints) {
      const entry = hardByName[hc.name] ?? { passed: 0, total: 0 };
      entry.total++;
      if (hc.passed) entry.passed++;
      hardByName[hc.name] = entry;
    }
  }
  const hardConstraintPassRate: Record<string, number> = {};
  for (const [name, { passed, total }] of Object.entries(hardByName)) {
    hardConstraintPassRate[name] = passed / total;
  }

  // Per-soft-score stats.
  const softByName: Record<string, number[]> = {};
  for (const run of runs) {
    for (const ss of run.softScores) {
      (softByName[ss.name] ??= []).push(ss.score);
    }
  }
  const softScoreStats: Record<string, SoftScoreStats> = {};
  for (const [name, values] of Object.entries(softByName)) {
    softScoreStats[name] = computeStats(values);
  }

  const overallPassRate =
    runs.filter(r => r.allHardConstraintsPassed).length / runCount;
  const meanWeightedSoftScore =
    runs.reduce((s, r) => s + r.weightedSoftScore, 0) / runCount;
  const medianDurationMs = median(runs.map(r => r.durationMs));

  return {
    caseId,
    caseName,
    agentType,
    runCount,
    hardConstraintPassRate,
    softScoreStats,
    overallPassRate,
    meanWeightedSoftScore,
    medianDurationMs,
    runs,
  };
}
