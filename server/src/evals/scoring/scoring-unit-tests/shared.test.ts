/**
 * @module shared.test
 * @description Unit tests for shared scoring utilities. These functions are
 * pure and shared across all three agent scorers, so they get the strictest
 * coverage. Written first per the TDD discipline in CLAUDE.md.
 */
import { describe, it, expect } from 'vitest';
import {
  hardConstraint,
  softScore,
  withinTolerance,
  withinFraction,
  pass,
  fail,
  amortizationMonths,
  totalInterestPaid,
  rankCorrelation,
  weightedMean,
  computeStats,
} from '../shared.js';

describe('hardConstraint', () => {
  it('builds a passing constraint result', () => {
    const r = hardConstraint('foo', true, 'all good');
    expect(r).toEqual({ name: 'foo', passed: true, detail: 'all good' });
  });

  it('builds a failing constraint result', () => {
    const r = hardConstraint('foo', false, 'broken');
    expect(r.passed).toBe(false);
  });
});

describe('softScore', () => {
  it('builds a soft score with weight and detail', () => {
    const r = softScore('quality', 0.75, 2, 'within range');
    expect(r).toEqual({ name: 'quality', score: 0.75, weight: 2, detail: 'within range' });
  });

  it('clamps scores above 1.0', () => {
    expect(softScore('x', 1.5, 1, '').score).toBe(1.0);
  });

  it('clamps scores below 0.0', () => {
    expect(softScore('x', -0.5, 1, '').score).toBe(0.0);
  });
});

describe('withinTolerance', () => {
  it('passes when actual equals expected', () => {
    expect(withinTolerance(100, 100, 0.01)).toBe(true);
  });

  it('passes when actual is within absolute tolerance', () => {
    expect(withinTolerance(100.005, 100, 0.01)).toBe(true);
  });

  it('fails when actual exceeds tolerance', () => {
    expect(withinTolerance(100.1, 100, 0.01)).toBe(false);
  });

  it('handles negative deviations symmetrically', () => {
    expect(withinTolerance(99.995, 100, 0.01)).toBe(true);
    expect(withinTolerance(99.9, 100, 0.01)).toBe(false);
  });
});

describe('withinFraction', () => {
  it('passes when actual is within fractional tolerance of expected', () => {
    expect(withinFraction(105, 100, 0.10)).toBe(true);
    expect(withinFraction(95, 100, 0.10)).toBe(true);
  });

  it('fails when actual exceeds fractional tolerance', () => {
    expect(withinFraction(120, 100, 0.10)).toBe(false);
  });

  it('treats zero expected with absolute tolerance fallback', () => {
    expect(withinFraction(0.001, 0, 0.10)).toBe(true);
    expect(withinFraction(50, 0, 0.10)).toBe(false);
  });
});

describe('pass / fail helpers', () => {
  it('pass returns score 1.0', () => {
    expect(pass('s', 3, 'good').score).toBe(1.0);
  });

  it('fail returns score 0.0', () => {
    expect(fail('s', 3, 'bad').score).toBe(0.0);
  });
});

describe('amortizationMonths', () => {
  it('returns Infinity when payment cannot cover monthly interest', () => {
    // $1000 balance at 24% APR = $20/mo interest. $15 payment can't keep up.
    expect(amortizationMonths(1000, 0.24, 15)).toBe(Infinity);
  });

  it('computes months for a zero-interest debt as balance / payment', () => {
    expect(amortizationMonths(1000, 0, 100)).toBe(10);
  });

  it('computes months for a positive-interest debt within rounding', () => {
    // $5000 at 24% APR with $200/mo: roughly 32 months by standard amortization.
    const months = amortizationMonths(5000, 0.24, 200);
    expect(months).toBeGreaterThan(28);
    expect(months).toBeLessThanOrEqual(36);
  });

  it('returns 0 when balance is already zero', () => {
    expect(amortizationMonths(0, 0.20, 100)).toBe(0);
  });
});

describe('totalInterestPaid', () => {
  it('returns 0 for a zero-interest loan', () => {
    expect(totalInterestPaid(1000, 0, 100)).toBe(0);
  });

  it('returns the difference between total payments and principal for finite payoff', () => {
    // $5000 / 24% / $200 -> ~$1455 interest over the life of the loan.
    const interest = totalInterestPaid(5000, 0.24, 200);
    expect(interest).toBeGreaterThan(1000);
    expect(interest).toBeLessThan(2500);
  });

  it('returns Infinity when payment does not cover interest', () => {
    expect(totalInterestPaid(1000, 0.24, 15)).toBe(Infinity);
  });
});

describe('rankCorrelation', () => {
  it('returns 1.0 for perfectly correlated rankings', () => {
    expect(rankCorrelation([3, 2, 1], [30, 20, 10])).toBe(1.0);
  });

  it('returns 0.0 for perfectly anti-correlated rankings', () => {
    expect(rankCorrelation([3, 2, 1], [10, 20, 30])).toBe(0.0);
  });

  it('returns 0.5 for uncorrelated rankings', () => {
    // Two items: one matches order, the other does not -> 50% concordant pairs.
    const score = rankCorrelation([3, 2, 1, 0], [3, 2, 0, 1]);
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1.0);
  });

  it('returns 1.0 for a single-item ranking (vacuously true)', () => {
    expect(rankCorrelation([1], [99])).toBe(1.0);
  });
});

describe('weightedMean', () => {
  it('computes the weighted mean of soft scores', () => {
    const scores = [
      { name: 'a', score: 1.0, weight: 3, detail: '' },
      { name: 'b', score: 0.0, weight: 1, detail: '' },
    ];
    expect(weightedMean(scores)).toBeCloseTo(0.75);
  });

  it('returns 0 for an empty list', () => {
    expect(weightedMean([])).toBe(0);
  });

  it('returns 0 when all weights are zero', () => {
    expect(weightedMean([{ name: 'x', score: 1, weight: 0, detail: '' }])).toBe(0);
  });
});

describe('computeStats', () => {
  it('computes mean, min, max, and stddev', () => {
    const stats = computeStats([1, 2, 3, 4, 5]);
    expect(stats.mean).toBe(3);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
    expect(stats.stddev).toBeCloseTo(Math.sqrt(2), 5);
  });

  it('returns zeros for an empty array', () => {
    expect(computeStats([])).toEqual({ mean: 0, min: 0, max: 0, stddev: 0 });
  });

  it('handles a single value (stddev 0)', () => {
    expect(computeStats([7])).toEqual({ mean: 7, min: 7, max: 7, stddev: 0 });
  });
});
