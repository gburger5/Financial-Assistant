/**
 * @module liabilities.repository.test
 * @description Unit tests for the Liabilities DynamoDB repository.
 * The AWS SDK `db` client is fully mocked — no real DynamoDB is hit.
 * Each test verifies the correct command type and input fields are sent.
 *
 * Liabilities table schema:
 *   PK: userId (HASH), SK: plaidAccountId (RANGE)
 *
 * Key design distinction from every other repository in this codebase:
 *   upsertSnapshot uses PutCommand (full overwrite) — NOT UpdateCommand.
 *   Liabilities are current state, not historical records. There is no
 *   analytical value in preserving previous field values; only current state matters.
 *   No ConditionExpression: the entire record is always replaced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted() executes before module imports, making mockSend available
// inside the vi.mock factory even though vi.mock is hoisted to the top.
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('../../../db/index.js', () => ({
  db: { send: mockSend },
}));

import { upsertSnapshot, getByUserId } from '../liabilities.repository.js';
import type { CreditLiability, StudentLiability, MortgageLiability } from '../liabilities.types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleCredit: CreditLiability = {
  userId: 'user-123',
  plaidAccountId: 'acct-credit',
  liabilityType: 'credit',
  currentBalance: null,
  details: {
    minimumPaymentAmount: 25.0,
    nextPaymentDueDate: '2025-02-15',
    lastPaymentAmount: 100.0,
    lastStatementBalance: 500.0,
    aprs: [
      {
        aprPercentage: 24.99,
        aprType: 'purchase',
        balanceSubjectToApr: 500.0,
        interestChargeAmount: 10.41,
      },
    ],
  },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-15T00:00:00.000Z',
};

const sampleStudent: StudentLiability = {
  userId: 'user-123',
  plaidAccountId: 'acct-student',
  liabilityType: 'student',
  currentBalance: null,
  details: {
    outstandingInterestAmount: 450.0,
    outstandingPrincipalAmount: 18500.0,
    originationPrincipalAmount: 20000.0,
    interestRatePercentage: 5.05,
    minimumPaymentAmount: 200.0,
    servicerAddress: {
      city: 'Salt Lake City',
      country: 'US',
      postalCode: '84119',
      region: 'UT',
      street: '123 Servicer Ln',
    },
    repaymentPlan: { description: 'Standard Repayment', type: 'standard' },
    sequenceNumber: '1',
  },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-15T00:00:00.000Z',
};

const sampleMortgage: MortgageLiability = {
  userId: 'user-123',
  plaidAccountId: 'acct-mortgage',
  liabilityType: 'mortgage',
  currentBalance: null,
  details: {
    outstandingPrincipalBalance: 210000.0,
    interestRatePercentage: 6.75,
    nextMonthlyPayment: 1450.0,
    originationDate: '2020-06-01',
    maturityDate: '2050-06-01',
    propertyAddress: {
      city: 'Austin',
      country: 'US',
      postalCode: '78701',
      region: 'TX',
      street: '456 Main St',
    },
    escrowBalance: 3200.0,
    hasPmi: false,
    hasPrepaymentPenalty: null,
  },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-15T00:00:00.000Z',
};

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// upsertSnapshot
// ---------------------------------------------------------------------------

describe('upsertSnapshot', () => {
  it('uses PutCommand (not UpdateCommand) — liabilities are full-overwrite current state, not historical records', async () => {
    mockSend.mockResolvedValue({});
    await upsertSnapshot(sampleCredit);
    const cmd = mockSend.mock.calls[0][0];
    // PutCommand uses Item; UpdateCommand uses Key + UpdateExpression
    expect(cmd.input.Item).toBeDefined();
    expect(cmd.input.UpdateExpression).toBeUndefined();
  });

  it('targets the Liabilities table', async () => {
    mockSend.mockResolvedValue({});
    await upsertSnapshot(sampleCredit);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Liabilities');
  });

  it('writes userId and plaidAccountId into the item (PK and SK)', async () => {
    mockSend.mockResolvedValue({});
    await upsertSnapshot(sampleCredit);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.userId).toBe('user-123');
    expect(cmd.input.Item.plaidAccountId).toBe('acct-credit');
  });

  it('has no ConditionExpression — intentional full overwrite with no guards', async () => {
    mockSend.mockResolvedValue({});
    await upsertSnapshot(sampleCredit);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ConditionExpression).toBeUndefined();
  });

  it('includes liabilityType in the item so the discriminant is queryable', async () => {
    mockSend.mockResolvedValue({});
    await upsertSnapshot(sampleCredit);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.liabilityType).toBe('credit');
  });

  it('includes the details object nested under details', async () => {
    mockSend.mockResolvedValue({});
    await upsertSnapshot(sampleCredit);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.details).toBeDefined();
    expect(typeof cmd.input.Item.details).toBe('object');
  });

  it('includes currentBalance as null — balances live in the Accounts table', async () => {
    mockSend.mockResolvedValue({});
    await upsertSnapshot(sampleCredit);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.currentBalance).toBeNull();
  });

  it('includes updatedAt in the item', async () => {
    mockSend.mockResolvedValue({});
    await upsertSnapshot(sampleCredit);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.updatedAt).toBe('2025-01-15T00:00:00.000Z');
  });

  it('includes createdAt in the item', async () => {
    mockSend.mockResolvedValue({});
    await upsertSnapshot(sampleCredit);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.createdAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('correctly stores a student liability with liabilityType: student', async () => {
    mockSend.mockResolvedValue({});
    await upsertSnapshot(sampleStudent);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.liabilityType).toBe('student');
    expect(cmd.input.Item.plaidAccountId).toBe('acct-student');
  });

  it('correctly stores a mortgage liability with liabilityType: mortgage', async () => {
    mockSend.mockResolvedValue({});
    await upsertSnapshot(sampleMortgage);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.liabilityType).toBe('mortgage');
    expect(cmd.input.Item.plaidAccountId).toBe('acct-mortgage');
  });

  it('returns void on success', async () => {
    mockSend.mockResolvedValue({});
    const result = await upsertSnapshot(sampleCredit);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getByUserId
// ---------------------------------------------------------------------------

describe('getByUserId', () => {
  it('returns an empty array when Items is an empty array', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await getByUserId('user-123');
    expect(result).toEqual([]);
  });

  it('returns an empty array when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await getByUserId('user-123');
    expect(result).toEqual([]);
  });

  it('returns all liabilities for the user when found', async () => {
    mockSend.mockResolvedValue({ Items: [sampleCredit, sampleStudent, sampleMortgage] });
    const result = await getByUserId('user-123');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(sampleCredit);
    expect(result[1]).toEqual(sampleStudent);
    expect(result[2]).toEqual(sampleMortgage);
  });

  it('queries the Liabilities base table (no IndexName)', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getByUserId('user-123');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Liabilities');
    expect(cmd.input.IndexName).toBeUndefined();
  });

  it('filters by the provided userId via KeyConditionExpression', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await getByUserId('user-123');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.KeyConditionExpression).toBeDefined();
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('user-123');
  });
});
