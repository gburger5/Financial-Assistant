/**
 * @module liabilities.service.test
 * @description Unit tests for the Liabilities service (business logic layer).
 * The repository, Plaid client, items service, accounts service, and logger
 * are all fully mocked — no DynamoDB calls or real HTTP requests are made.
 *
 * Key behaviors under test:
 *   - mapAddress: snake_case → camelCase address conversion, null-safe
 *   - mapCreditLiability: pure mapping of PlaidCreditLiability → CreditLiability
 *   - mapStudentLiability: pure mapping of PlaidStudentLoan → StudentLiability
 *   - mapMortgageLiability: pure mapping of PlaidMortgage → MortgageLiability
 *     (note: interest_rate is nested as { percentage } in Plaid's response)
 *   - updateLiabilities: orchestrates getItemForSync, liabilitiesGet, syncAccounts,
 *     writes in parallel via Promise.allSettled, logs failures without aborting
 *   - getLiabilitiesForUser: delegates to repository
 *   - getCreditLiabilities: in-memory filter by liabilityType === 'credit'
 *   - getStudentLiabilities: in-memory filter by liabilityType === 'student'
 *   - getMortgageLiabilities: in-memory filter by liabilityType === 'mortgage'
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../liabilities.repository.js', () => ({
  saveSnapshot: vi.fn(),
  getLatestByUserId: vi.fn(),
  getAllByUserId: vi.fn(),
}));

vi.mock('../../items/items.service.js', () => ({
  getItemForSync: vi.fn(),
}));

vi.mock('../../accounts/accounts.service.js', () => ({
  syncAccounts: vi.fn(),
}));

// vi.hoisted() makes mockLiabilitiesGet available inside the vi.mock factory.
const { mockLiabilitiesGet, mockLogError } = vi.hoisted(() => ({
  mockLiabilitiesGet: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('../../../lib/plaidClient.js', () => ({
  plaidClient: {
    liabilitiesGet: mockLiabilitiesGet,
  },
}));

vi.mock('../../../lib/logger.js', () => ({
  createLogger: () => ({
    error: mockLogError,
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));

import {
  mapAddress,
  mapCreditLiability,
  mapStudentLiability,
  mapMortgageLiability,
  updateLiabilities,
  getLiabilitiesForUser,
  getCreditLiabilities,
  getStudentLiabilities,
  getMortgageLiabilities,
} from '../liabilities.service.js';
import * as repo from '../liabilities.repository.js';
import * as itemsService from '../../items/items.service.js';
import * as accountsService from '../../accounts/accounts.service.js';
import type {
  CreditLiability,
  StudentLiability,
  MortgageLiability,
  PlaidAddress,
  PlaidCreditLiability,
  PlaidStudentLoan,
  PlaidMortgage,
} from '../liabilities.types.js';

const mockSaveSnapshot = vi.mocked(repo.saveSnapshot);
const mockGetLatestByUserId = vi.mocked(repo.getLatestByUserId);
const mockGetItemForSync = vi.mocked(itemsService.getItemForSync);
const mockSyncAccounts = vi.mocked(accountsService.syncAccounts);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const samplePlaidAddress: PlaidAddress = {
  city: 'Austin',
  country: 'US',
  postal_code: '78701',
  region: 'TX',
  street: '456 Main St',
};

const samplePlaidCredit: PlaidCreditLiability = {
  account_id: 'acct-credit',
  aprs: [
    {
      apr_percentage: 24.99,
      apr_type: 'purchase',
      balance_subject_to_apr: 500.0,
      interest_charge_amount: 10.41,
    },
  ],
  minimum_payment_amount: 25.0,
  next_payment_due_date: '2025-02-15',
  last_payment_amount: 100.0,
  last_statement_balance: 500.0,
};

const samplePlaidStudent: PlaidStudentLoan = {
  account_id: 'acct-student',
  outstanding_interest_amount: 450.0,
  outstanding_principal_amount: 18500.0,
  origination_principal_amount: 20000.0,
  interest_rate_percentage: 5.05,
  minimum_payment_amount: 200.0,
  servicer_address: {
    city: 'Salt Lake City',
    country: 'US',
    postal_code: '84119',
    region: 'UT',
    street: '123 Servicer Ln',
  },
  repayment_plan: { description: 'Standard Repayment', type: 'standard' },
  sequence_number: '1',
};

const samplePlaidMortgage: PlaidMortgage = {
  account_id: 'acct-mortgage',
  outstanding_principal_balance: 210000.0,
  interest_rate: { percentage: 6.75, type: 'fixed' },
  next_monthly_payment: 1450.0,
  origination_date: '2020-06-01',
  maturity_date: '2050-06-01',
  property_address: samplePlaidAddress,
  escrow_balance: 3200.0,
  has_pmi: false,
  has_prepayment_penalty: null,
};

/** Minimal PlaidItem with decrypted access token, as returned by getItemForSync. */
const sampleItem = {
  userId: 'user-123',
  itemId: 'item-abc',
  accessToken: 'access-sandbox-token',
  institutionId: 'ins-1',
  institutionName: 'Test Bank',
  status: 'active' as const,
  transactionCursor: null,
  consentExpirationTime: null,
  linkedAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

/** Builds a mock liabilitiesGet response. All three arrays may be null (some items lack all types). */
function makeLiabilitiesResponse(opts: {
  credit?: PlaidCreditLiability[] | null;
  student?: PlaidStudentLoan[] | null;
  mortgage?: PlaidMortgage[] | null;
  accounts?: unknown[];
}) {
  return {
    data: {
      accounts: opts.accounts ?? [],
      liabilities: {
        credit: opts.credit ?? null,
        student: opts.student ?? null,
        mortgage: opts.mortgage ?? null,
      },
    },
  };
}

const sampleCredit: CreditLiability = {
  userId: 'user-123',
  sortKey: 'acct-credit#01ABCDEF',
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
  sortKey: 'acct-student#01ABCDEF',
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
  sortKey: 'acct-mortgage#01ABCDEF',
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
// mapAddress
// ---------------------------------------------------------------------------

describe('mapAddress', () => {
  it('returns null when the input address is null', () => {
    expect(mapAddress(null)).toBeNull();
  });

  it('maps city from snake_case to camelCase', () => {
    expect(mapAddress(samplePlaidAddress)?.city).toBe('Austin');
  });

  it('maps country', () => {
    expect(mapAddress(samplePlaidAddress)?.country).toBe('US');
  });

  it('maps postal_code to postalCode', () => {
    expect(mapAddress(samplePlaidAddress)?.postalCode).toBe('78701');
  });

  it('maps region', () => {
    expect(mapAddress(samplePlaidAddress)?.region).toBe('TX');
  });

  it('maps street', () => {
    expect(mapAddress(samplePlaidAddress)?.street).toBe('456 Main St');
  });

  it('preserves null fields in the address', () => {
    const sparse: PlaidAddress = {
      city: null,
      country: null,
      postal_code: null,
      region: null,
      street: null,
    };
    const result = mapAddress(sparse);
    expect(result?.city).toBeNull();
    expect(result?.postalCode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mapCreditLiability
// ---------------------------------------------------------------------------

describe('mapCreditLiability', () => {
  it('sets userId from the first parameter', () => {
    const result = mapCreditLiability('user-123', samplePlaidCredit);
    expect(result.userId).toBe('user-123');
  });

  it('sets plaidAccountId from account_id', () => {
    const result = mapCreditLiability('user-123', samplePlaidCredit);
    expect(result.plaidAccountId).toBe('acct-credit');
  });

  it('sets sortKey as plaidAccountId#ULID', () => {
    const result = mapCreditLiability('user-123', samplePlaidCredit);
    expect(result.sortKey).toMatch(/^acct-credit#/);
    // ULID suffix should be 26 chars
    const ulidPart = result.sortKey.split('#')[1];
    expect(ulidPart).toHaveLength(26);
  });

  it('sets liabilityType to "credit"', () => {
    const result = mapCreditLiability('user-123', samplePlaidCredit);
    expect(result.liabilityType).toBe('credit');
  });

  it('sets currentBalance to null', () => {
    const result = mapCreditLiability('user-123', samplePlaidCredit);
    expect(result.currentBalance).toBeNull();
  });

  it('maps minimum_payment_amount to details.minimumPaymentAmount', () => {
    const result = mapCreditLiability('user-123', samplePlaidCredit);
    expect(result.details.minimumPaymentAmount).toBe(25.0);
  });

  it('maps next_payment_due_date to details.nextPaymentDueDate', () => {
    const result = mapCreditLiability('user-123', samplePlaidCredit);
    expect(result.details.nextPaymentDueDate).toBe('2025-02-15');
  });

  it('maps last_payment_amount to details.lastPaymentAmount', () => {
    const result = mapCreditLiability('user-123', samplePlaidCredit);
    expect(result.details.lastPaymentAmount).toBe(100.0);
  });

  it('maps last_statement_balance to details.lastStatementBalance', () => {
    const result = mapCreditLiability('user-123', samplePlaidCredit);
    expect(result.details.lastStatementBalance).toBe(500.0);
  });

  it('maps aprs array with snake_case → camelCase field conversion', () => {
    const result = mapCreditLiability('user-123', samplePlaidCredit);
    expect(result.details.aprs).toHaveLength(1);
    expect(result.details.aprs[0].aprPercentage).toBe(24.99);
    expect(result.details.aprs[0].aprType).toBe('purchase');
    expect(result.details.aprs[0].balanceSubjectToApr).toBe(500.0);
    expect(result.details.aprs[0].interestChargeAmount).toBe(10.41);
  });

  it('sets createdAt to a current ISO timestamp', () => {
    const before = new Date().toISOString();
    const result = mapCreditLiability('user-123', samplePlaidCredit);
    const after = new Date().toISOString();
    expect(result.createdAt >= before).toBe(true);
    expect(result.createdAt <= after).toBe(true);
  });

  it('sets updatedAt to a current ISO timestamp', () => {
    const before = new Date().toISOString();
    const result = mapCreditLiability('user-123', samplePlaidCredit);
    const after = new Date().toISOString();
    expect(result.updatedAt >= before).toBe(true);
    expect(result.updatedAt <= after).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mapStudentLiability
// ---------------------------------------------------------------------------

describe('mapStudentLiability', () => {
  it('sets userId from the first parameter', () => {
    const result = mapStudentLiability('user-123', samplePlaidStudent);
    expect(result.userId).toBe('user-123');
  });

  it('sets plaidAccountId from account_id', () => {
    const result = mapStudentLiability('user-123', samplePlaidStudent);
    expect(result.plaidAccountId).toBe('acct-student');
  });

  it('sets liabilityType to "student"', () => {
    const result = mapStudentLiability('user-123', samplePlaidStudent);
    expect(result.liabilityType).toBe('student');
  });

  it('sets currentBalance to null', () => {
    const result = mapStudentLiability('user-123', samplePlaidStudent);
    expect(result.currentBalance).toBeNull();
  });

  it('maps outstanding_interest_amount to details.outstandingInterestAmount', () => {
    const result = mapStudentLiability('user-123', samplePlaidStudent);
    expect(result.details.outstandingInterestAmount).toBe(450.0);
  });

  it('maps outstanding_principal_amount to details.outstandingPrincipalAmount', () => {
    const result = mapStudentLiability('user-123', samplePlaidStudent);
    expect(result.details.outstandingPrincipalAmount).toBe(18500.0);
  });

  it('maps origination_principal_amount to details.originationPrincipalAmount', () => {
    const result = mapStudentLiability('user-123', samplePlaidStudent);
    expect(result.details.originationPrincipalAmount).toBe(20000.0);
  });

  it('maps interest_rate_percentage to details.interestRatePercentage', () => {
    const result = mapStudentLiability('user-123', samplePlaidStudent);
    expect(result.details.interestRatePercentage).toBe(5.05);
  });

  it('maps minimum_payment_amount to details.minimumPaymentAmount', () => {
    const result = mapStudentLiability('user-123', samplePlaidStudent);
    expect(result.details.minimumPaymentAmount).toBe(200.0);
  });

  it('maps servicer_address through mapAddress (postal_code → postalCode)', () => {
    const result = mapStudentLiability('user-123', samplePlaidStudent);
    expect(result.details.servicerAddress?.postalCode).toBe('84119');
    expect(result.details.servicerAddress?.city).toBe('Salt Lake City');
  });

  it('maps servicer_address as null when it is null', () => {
    const loan: PlaidStudentLoan = { ...samplePlaidStudent, servicer_address: null };
    const result = mapStudentLiability('user-123', loan);
    expect(result.details.servicerAddress).toBeNull();
  });

  it('maps repayment_plan description and type', () => {
    const result = mapStudentLiability('user-123', samplePlaidStudent);
    expect(result.details.repaymentPlan?.description).toBe('Standard Repayment');
    expect(result.details.repaymentPlan?.type).toBe('standard');
  });

  it('maps repayment_plan as null when it is null', () => {
    const loan: PlaidStudentLoan = { ...samplePlaidStudent, repayment_plan: null };
    const result = mapStudentLiability('user-123', loan);
    expect(result.details.repaymentPlan).toBeNull();
  });

  it('maps sequence_number to details.sequenceNumber', () => {
    const result = mapStudentLiability('user-123', samplePlaidStudent);
    expect(result.details.sequenceNumber).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// mapMortgageLiability
// ---------------------------------------------------------------------------

describe('mapMortgageLiability', () => {
  it('sets userId from the first parameter', () => {
    const result = mapMortgageLiability('user-123', samplePlaidMortgage);
    expect(result.userId).toBe('user-123');
  });

  it('sets plaidAccountId from account_id', () => {
    const result = mapMortgageLiability('user-123', samplePlaidMortgage);
    expect(result.plaidAccountId).toBe('acct-mortgage');
  });

  it('sets liabilityType to "mortgage"', () => {
    const result = mapMortgageLiability('user-123', samplePlaidMortgage);
    expect(result.liabilityType).toBe('mortgage');
  });

  it('sets currentBalance to null', () => {
    const result = mapMortgageLiability('user-123', samplePlaidMortgage);
    expect(result.currentBalance).toBeNull();
  });

  it('maps outstanding_principal_balance to details.outstandingPrincipalBalance', () => {
    const result = mapMortgageLiability('user-123', samplePlaidMortgage);
    expect(result.details.outstandingPrincipalBalance).toBe(210000.0);
  });

  it('extracts interest_rate.percentage into details.interestRatePercentage', () => {
    // Plaid nests the rate as interest_rate: { percentage } — we flatten it
    const result = mapMortgageLiability('user-123', samplePlaidMortgage);
    expect(result.details.interestRatePercentage).toBe(6.75);
  });

  it('sets details.interestRatePercentage to null when interest_rate is null', () => {
    const mortgage: PlaidMortgage = { ...samplePlaidMortgage, interest_rate: null };
    const result = mapMortgageLiability('user-123', mortgage);
    expect(result.details.interestRatePercentage).toBeNull();
  });

  it('maps next_monthly_payment to details.nextMonthlyPayment', () => {
    const result = mapMortgageLiability('user-123', samplePlaidMortgage);
    expect(result.details.nextMonthlyPayment).toBe(1450.0);
  });

  it('maps origination_date to details.originationDate', () => {
    const result = mapMortgageLiability('user-123', samplePlaidMortgage);
    expect(result.details.originationDate).toBe('2020-06-01');
  });

  it('maps maturity_date to details.maturityDate', () => {
    const result = mapMortgageLiability('user-123', samplePlaidMortgage);
    expect(result.details.maturityDate).toBe('2050-06-01');
  });

  it('maps property_address through mapAddress (postal_code → postalCode)', () => {
    const result = mapMortgageLiability('user-123', samplePlaidMortgage);
    expect(result.details.propertyAddress?.postalCode).toBe('78701');
    expect(result.details.propertyAddress?.city).toBe('Austin');
  });

  it('maps property_address as null when it is null', () => {
    const mortgage: PlaidMortgage = { ...samplePlaidMortgage, property_address: null };
    const result = mapMortgageLiability('user-123', mortgage);
    expect(result.details.propertyAddress).toBeNull();
  });

  it('maps escrow_balance to details.escrowBalance', () => {
    const result = mapMortgageLiability('user-123', samplePlaidMortgage);
    expect(result.details.escrowBalance).toBe(3200.0);
  });

  it('maps has_pmi to details.hasPmi', () => {
    const result = mapMortgageLiability('user-123', samplePlaidMortgage);
    expect(result.details.hasPmi).toBe(false);
  });

  it('maps has_prepayment_penalty to details.hasPrepaymentPenalty (null when unknown)', () => {
    const result = mapMortgageLiability('user-123', samplePlaidMortgage);
    expect(result.details.hasPrepaymentPenalty).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateLiabilities
// ---------------------------------------------------------------------------

describe('updateLiabilities', () => {
  it('calls getItemForSync with the provided itemId', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockLiabilitiesGet.mockResolvedValue(makeLiabilitiesResponse({}));
    mockSyncAccounts.mockResolvedValue(undefined);

    await updateLiabilities('item-abc');

    expect(mockGetItemForSync).toHaveBeenCalledWith('item-abc');
  });

  it('calls liabilitiesGet with the decrypted access token from getItemForSync', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockLiabilitiesGet.mockResolvedValue(makeLiabilitiesResponse({}));
    mockSyncAccounts.mockResolvedValue(undefined);

    await updateLiabilities('item-abc');

    expect(mockLiabilitiesGet).toHaveBeenCalledWith({
      access_token: 'access-sandbox-token',
    });
  });

  it('calls syncAccounts with userId, itemId, and the accounts array from the response', async () => {
    const accounts = [{ account_id: 'acct-credit' }];
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockLiabilitiesGet.mockResolvedValue(makeLiabilitiesResponse({ accounts }));
    mockSyncAccounts.mockResolvedValue(undefined);

    await updateLiabilities('item-abc');

    expect(mockSyncAccounts).toHaveBeenCalledWith('user-123', 'item-abc', accounts);
  });

  it('upserts all credit liabilities', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockLiabilitiesGet.mockResolvedValue(
      makeLiabilitiesResponse({ credit: [samplePlaidCredit] }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    mockSaveSnapshot.mockResolvedValue(undefined);

    await updateLiabilities('item-abc');

    const creditUpserts = mockSaveSnapshot.mock.calls.filter(
      ([l]) => l.liabilityType === 'credit',
    );
    expect(creditUpserts).toHaveLength(1);
  });

  it('upserts all student liabilities', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockLiabilitiesGet.mockResolvedValue(
      makeLiabilitiesResponse({ student: [samplePlaidStudent] }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    mockSaveSnapshot.mockResolvedValue(undefined);

    await updateLiabilities('item-abc');

    const studentUpserts = mockSaveSnapshot.mock.calls.filter(
      ([l]) => l.liabilityType === 'student',
    );
    expect(studentUpserts).toHaveLength(1);
  });

  it('upserts all mortgage liabilities', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockLiabilitiesGet.mockResolvedValue(
      makeLiabilitiesResponse({ mortgage: [samplePlaidMortgage] }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    mockSaveSnapshot.mockResolvedValue(undefined);

    await updateLiabilities('item-abc');

    const mortgageUpserts = mockSaveSnapshot.mock.calls.filter(
      ([l]) => l.liabilityType === 'mortgage',
    );
    expect(mortgageUpserts).toHaveLength(1);
  });

  it('returns creditCount, studentCount, mortgageCount matching the Plaid response arrays', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockLiabilitiesGet.mockResolvedValue(
      makeLiabilitiesResponse({
        credit: [samplePlaidCredit],
        student: [samplePlaidStudent],
        mortgage: [samplePlaidMortgage],
      }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    mockSaveSnapshot.mockResolvedValue(undefined);

    const result = await updateLiabilities('item-abc');

    expect(result.creditCount).toBe(1);
    expect(result.studentCount).toBe(1);
    expect(result.mortgageCount).toBe(1);
  });

  it('handles null liability arrays gracefully — an item may have credit but no student loans', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    // All three arrays are null (item has no liabilities yet, or wrong account type)
    mockLiabilitiesGet.mockResolvedValue(
      makeLiabilitiesResponse({ credit: null, student: null, mortgage: null }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);

    const result = await updateLiabilities('item-abc');

    expect(result.creditCount).toBe(0);
    expect(result.studentCount).toBe(0);
    expect(result.mortgageCount).toBe(0);
    expect(mockSaveSnapshot).not.toHaveBeenCalled();
  });

  it('continues syncing remaining liabilities when one individual upsert fails', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockLiabilitiesGet.mockResolvedValue(
      makeLiabilitiesResponse({ credit: [samplePlaidCredit, { ...samplePlaidCredit, account_id: 'acct-credit-2' }] }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    // First upsert fails, second succeeds
    mockSaveSnapshot
      .mockRejectedValueOnce(new Error('DynamoDB timeout'))
      .mockResolvedValueOnce(undefined);

    // Must not throw — Promise.allSettled absorbs individual failures
    await expect(updateLiabilities('item-abc')).resolves.not.toThrow();
    expect(mockSaveSnapshot).toHaveBeenCalledTimes(2);
  });

  it('logs an error when an individual upsert fails', async () => {
    mockGetItemForSync.mockResolvedValue(sampleItem);
    mockLiabilitiesGet.mockResolvedValue(
      makeLiabilitiesResponse({ credit: [samplePlaidCredit] }),
    );
    mockSyncAccounts.mockResolvedValue(undefined);
    mockSaveSnapshot.mockRejectedValue(new Error('DynamoDB timeout'));

    await updateLiabilities('item-abc');

    expect(mockLogError).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getLiabilitiesForUser
// ---------------------------------------------------------------------------

describe('getLiabilitiesForUser', () => {
  it('delegates to repository getLatestByUserId with the provided userId', async () => {
    mockGetLatestByUserId.mockResolvedValue([sampleCredit, sampleStudent]);
    const result = await getLiabilitiesForUser('user-123');
    expect(mockGetLatestByUserId).toHaveBeenCalledWith('user-123');
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getCreditLiabilities
// ---------------------------------------------------------------------------

describe('getCreditLiabilities', () => {
  it('returns only credit liabilities from the full list', async () => {
    mockGetLatestByUserId.mockResolvedValue([sampleCredit, sampleStudent, sampleMortgage]);
    const result = await getCreditLiabilities('user-123');
    expect(result).toHaveLength(1);
    expect(result[0].liabilityType).toBe('credit');
  });

  it('returns an empty array when there are no credit liabilities', async () => {
    mockGetLatestByUserId.mockResolvedValue([sampleStudent, sampleMortgage]);
    const result = await getCreditLiabilities('user-123');
    expect(result).toHaveLength(0);
  });

  it('calls getLatestByUserId with the provided userId', async () => {
    mockGetLatestByUserId.mockResolvedValue([]);
    await getCreditLiabilities('user-456');
    expect(mockGetLatestByUserId).toHaveBeenCalledWith('user-456');
  });
});

// ---------------------------------------------------------------------------
// getStudentLiabilities
// ---------------------------------------------------------------------------

describe('getStudentLiabilities', () => {
  it('returns only student liabilities from the full list', async () => {
    mockGetLatestByUserId.mockResolvedValue([sampleCredit, sampleStudent, sampleMortgage]);
    const result = await getStudentLiabilities('user-123');
    expect(result).toHaveLength(1);
    expect(result[0].liabilityType).toBe('student');
  });

  it('returns an empty array when there are no student liabilities', async () => {
    mockGetLatestByUserId.mockResolvedValue([sampleCredit, sampleMortgage]);
    const result = await getStudentLiabilities('user-123');
    expect(result).toHaveLength(0);
  });

  it('calls getLatestByUserId with the provided userId', async () => {
    mockGetLatestByUserId.mockResolvedValue([]);
    await getStudentLiabilities('user-456');
    expect(mockGetLatestByUserId).toHaveBeenCalledWith('user-456');
  });
});

// ---------------------------------------------------------------------------
// getMortgageLiabilities
// ---------------------------------------------------------------------------

describe('getMortgageLiabilities', () => {
  it('returns only mortgage liabilities from the full list', async () => {
    mockGetLatestByUserId.mockResolvedValue([sampleCredit, sampleStudent, sampleMortgage]);
    const result = await getMortgageLiabilities('user-123');
    expect(result).toHaveLength(1);
    expect(result[0].liabilityType).toBe('mortgage');
  });

  it('returns an empty array when there are no mortgage liabilities', async () => {
    mockGetLatestByUserId.mockResolvedValue([sampleCredit, sampleStudent]);
    const result = await getMortgageLiabilities('user-123');
    expect(result).toHaveLength(0);
  });

  it('calls getLatestByUserId with the provided userId', async () => {
    mockGetLatestByUserId.mockResolvedValue([]);
    await getMortgageLiabilities('user-456');
    expect(mockGetLatestByUserId).toHaveBeenCalledWith('user-456');
  });
});
