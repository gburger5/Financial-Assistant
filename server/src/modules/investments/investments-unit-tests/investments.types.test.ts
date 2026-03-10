/**
 * @module investments.types.test
 * @description Compile-time and runtime shape assertions for the HYSA types
 * added to the investments module. Verifies the HysaLabel union and the
 * HighYieldSavingsAccount interface enforce the expected constraints.
 */

import { describe, it, expect } from 'vitest';
import type { HighYieldSavingsAccount, HysaLabel } from '../investments.types.js';

describe('HighYieldSavingsAccount type', () => {
  it('accepts a valid emergency_fund HYSA', () => {
    const account: HighYieldSavingsAccount = {
      accountId: '9nnEVV83pDSggg9KZKWJfJy7qMjADQF4p7NL7',
      name: 'High-Yield Savings - Emergency Fund',
      officialName: 'Chase High Yield Savings Account',
      mask: '9660',
      currentBalance: 5200,
      availableBalance: 5200,
      isoCurrencyCode: 'USD',
      label: 'emergency_fund',
      description: 'My emergency fund at Chase',
      target: 10000,
    };

    expect(account.label).toBe('emergency_fund');
    expect(account.target).toBe(10000);
    expect(account.description).toBe('My emergency fund at Chase');
    expect(account.currentBalance).toBe(5200);
    expect(account.accountId).toBe('9nnEVV83pDSggg9KZKWJfJy7qMjADQF4p7NL7');
  });

  it('accepts a valid other-labelled HYSA', () => {
    const account: HighYieldSavingsAccount = {
      accountId: 'vVVn55qGzyheeenW3WwbtRMqdBGbXJFqMLQj9',
      name: 'High-Yield Savings - Vacation Fund',
      officialName: 'Chase High Yield Savings Account',
      mask: '6253',
      currentBalance: 3550,
      availableBalance: 3550,
      isoCurrencyCode: 'USD',
      label: 'other',
      description: 'Vacation savings',
      target: 5000,
    };

    expect(account.label).toBe('other');
    expect(account.target).toBe(5000);
    expect(account.description).toBe('Vacation savings');
  });

  it('allows null for optional balance fields', () => {
    const account: HighYieldSavingsAccount = {
      accountId: 'abc123',
      name: 'HYSA',
      officialName: null,
      mask: null,
      currentBalance: 1000,
      availableBalance: null,
      isoCurrencyCode: null,
      label: 'other',
      description: '',
      target: 0,
    };

    expect(account.officialName).toBeNull();
    expect(account.availableBalance).toBeNull();
    expect(account.isoCurrencyCode).toBeNull();
  });
});

describe('HysaLabel type', () => {
  it('covers the expected values', () => {
    const labels: HysaLabel[] = ['emergency_fund', 'other'];

    expect(labels).toHaveLength(2);
    expect(labels).toContain('emergency_fund');
    expect(labels).toContain('other');
  });
});
