/**
 * @module aggregator.test
 * @description Unit tests for the eval aggregator. The aggregator collapses
 * N SingleRunScore objects into one EvalCaseResult — pure logic, no I/O.
 */
import { describe, it, expect } from 'vitest';
import { aggregateRuns } from '../aggregator.js';
import type { SingleRunScore } from '../../eval.types.js';

function makeRun(
  hardPassed: Record<string, boolean>,
  softs: Record<string, number>,
  durationMs = 100,
): SingleRunScore {
  const hardConstraints = Object.entries(hardPassed).map(([name, passed]) => ({
    name,
    passed,
    detail: '',
  }));
  const softScores = Object.entries(softs).map(([name, score]) => ({
    name,
    score,
    weight: 1,
    detail: '',
  }));
  return {
    hardConstraints,
    softScores,
    allHardConstraintsPassed: Object.values(hardPassed).every(Boolean),
    weightedSoftScore:
      Object.values(softs).reduce((s, v) => s + v, 0) / (Object.values(softs).length || 1),
    rawOutput: {},
    durationMs,
  };
}

describe('aggregateRuns', () => {
  it('computes per-constraint pass rates', () => {
    const runs = [
      makeRun({ a: true, b: true }, { x: 1 }),
      makeRun({ a: true, b: false }, { x: 1 }),
      makeRun({ a: false, b: false }, { x: 1 }),
    ];
    const result = aggregateRuns('case-id', 'Case Name', 'budget', runs);
    expect(result.hardConstraintPassRate.a).toBeCloseTo(2 / 3);
    expect(result.hardConstraintPassRate.b).toBeCloseTo(1 / 3);
  });

  it('computes per-soft-score statistics', () => {
    const runs = [
      makeRun({ a: true }, { x: 0.0 }),
      makeRun({ a: true }, { x: 0.5 }),
      makeRun({ a: true }, { x: 1.0 }),
    ];
    const result = aggregateRuns('id', 'name', 'debt', runs);
    expect(result.softScoreStats.x.mean).toBeCloseTo(0.5);
    expect(result.softScoreStats.x.min).toBe(0.0);
    expect(result.softScoreStats.x.max).toBe(1.0);
  });

  it('computes overallPassRate as fraction of runs where all hard constraints passed', () => {
    const runs = [
      makeRun({ a: true, b: true }, { x: 1 }),
      makeRun({ a: true, b: false }, { x: 1 }),
    ];
    const result = aggregateRuns('id', 'name', 'investing', runs);
    expect(result.overallPassRate).toBe(0.5);
  });

  it('computes meanWeightedSoftScore across runs', () => {
    const runs = [
      makeRun({ a: true }, { x: 0.4 }),
      makeRun({ a: true }, { x: 0.8 }),
    ];
    const result = aggregateRuns('id', 'name', 'budget', runs);
    expect(result.meanWeightedSoftScore).toBeCloseTo(0.6);
  });

  it('computes the median run duration', () => {
    const runs = [
      makeRun({ a: true }, { x: 1 }, 100),
      makeRun({ a: true }, { x: 1 }, 200),
      makeRun({ a: true }, { x: 1 }, 300),
    ];
    const result = aggregateRuns('id', 'name', 'budget', runs);
    expect(result.medianDurationMs).toBe(200);
  });

  it('handles even-length duration arrays by averaging the two middle values', () => {
    const runs = [
      makeRun({ a: true }, { x: 1 }, 100),
      makeRun({ a: true }, { x: 1 }, 200),
      makeRun({ a: true }, { x: 1 }, 300),
      makeRun({ a: true }, { x: 1 }, 400),
    ];
    const result = aggregateRuns('id', 'name', 'budget', runs);
    expect(result.medianDurationMs).toBe(250);
  });

  it('preserves caseId, caseName, agentType, and runCount on the result', () => {
    const runs = [makeRun({ a: true }, { x: 1 })];
    const result = aggregateRuns('the-id', 'The Name', 'investing', runs);
    expect(result.caseId).toBe('the-id');
    expect(result.caseName).toBe('The Name');
    expect(result.agentType).toBe('investing');
    expect(result.runCount).toBe(1);
  });

  it('handles a single run gracefully', () => {
    const runs = [makeRun({ a: true }, { x: 0.5 })];
    const result = aggregateRuns('id', 'name', 'budget', runs);
    expect(result.runCount).toBe(1);
    expect(result.overallPassRate).toBe(1);
    expect(result.softScoreStats.x.stddev).toBe(0);
  });
});
