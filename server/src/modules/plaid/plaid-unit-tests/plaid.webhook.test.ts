/**
 * @module plaid.webhook.test
 * @description Unit tests for the Plaid webhook routing and handler logic.
 * The verification module, items service, and all sync services are mocked.
 * Individual webhook type handlers are tested in isolation by calling them directly.
 * handleWebhook is tested by calling it with a minimal mock Fastify request/reply.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PlaidWebhookBody } from '../plaid.types.js';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockVerifyWebhookSignature, mockGetItemForSync, mockHandleLoginRequired } = vi.hoisted(
  () => ({
    mockVerifyWebhookSignature: vi.fn(),
    mockGetItemForSync: vi.fn(),
    mockHandleLoginRequired: vi.fn(),
  }),
);

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../plaid.verification.js', () => ({
  verifyWebhookSignature: mockVerifyWebhookSignature,
}));

vi.mock('../../items/items.service.js', () => ({
  getItemForSync: mockGetItemForSync,
  handleLoginRequired: mockHandleLoginRequired,
}));

vi.mock('../../transactions/transactions.service.js', () => ({
  syncTransactions: vi.fn(),
}));

vi.mock('../../investments/investments.service.js', () => ({
  updateInvestments: vi.fn(),
}));

vi.mock('../../liabilities/liabilities.service.js', () => ({
  updateLiabilities: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  handleWebhook,
  handleTransactionsWebhook,
  handleItemWebhook,
} from '../plaid.webhook.js';
import * as txService from '../../transactions/transactions.service.js';
import * as investmentsService from '../../investments/investments.service.js';
import * as liabilitiesService from '../../liabilities/liabilities.service.js';

const mockSyncTransactions = vi.mocked(txService.syncTransactions);
const mockUpdateInvestments = vi.mocked(investmentsService.updateInvestments);
const mockUpdateLiabilities = vi.mocked(liabilitiesService.updateLiabilities);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeItem = {
  userId: 'user-1',
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

const fakeSyncResult = { addedCount: 0, modifiedCount: 0, removedCount: 0, nextCursor: '', hasTransactionCapableAccounts: true, notReady: false };
const fakeInvestmentResult = { transactionsUpserted: 0, holdingsUpserted: 0, snapshotDate: '2024-01-01' };
const fakeLiabilityResult = { creditCount: 0, studentCount: 0, mortgageCount: 0 };

/**
 * Creates a minimal fake FastifyReply with chainable status/send methods.
 * Captures the last sent value in lastSent for assertion.
 */
function makeReply() {
  let lastSent: unknown;
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn((val: unknown) => {
      lastSent = val;
      return reply;
    }),
    getSent: () => lastSent,
  };
  return reply as unknown as FastifyReply & { getSent: () => unknown };
}

/**
 * Builds a fake FastifyRequest carrying a webhook body.
 */
function makeRequest(body: PlaidWebhookBody, rawBody?: string): FastifyRequest {
  return {
    headers: { 'plaid-verification': 'test-jwt' },
    rawBody: rawBody ?? JSON.stringify(body),
    body,
  } as unknown as FastifyRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyWebhookSignature.mockResolvedValue(undefined);
  mockGetItemForSync.mockResolvedValue(fakeItem);
  mockHandleLoginRequired.mockResolvedValue(undefined);
  mockSyncTransactions.mockResolvedValue(fakeSyncResult);
  mockUpdateInvestments.mockResolvedValue(fakeInvestmentResult);
  mockUpdateLiabilities.mockResolvedValue(fakeLiabilityResult);
});

// ---------------------------------------------------------------------------
// handleWebhook — always returns { received: true }
// ---------------------------------------------------------------------------

describe('handleWebhook — response contract', () => {
  it('returns { received: true } when verification passes', async () => {
    const body: PlaidWebhookBody = {
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'item-abc',
      error: null,
    };
    const reply = makeReply();
    const request = makeRequest(body);

    await handleWebhook(request, reply as unknown as FastifyReply);

    // Allow fire-and-forget to settle
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(reply.send).toHaveBeenCalledWith({ received: true });
  });

  it('returns { received: true } even when signature verification fails', async () => {
    // Verification throws — but the handler must still return 200
    mockVerifyWebhookSignature.mockRejectedValue(new Error('JWTVerificationFailed'));

    const body: PlaidWebhookBody = {
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'item-abc',
      error: null,
    };
    const reply = makeReply();
    const request = makeRequest(body);

    await handleWebhook(request, reply as unknown as FastifyReply);

    expect(reply.send).toHaveBeenCalledWith({ received: true });
  });

  it('does not call getItemForSync when verification fails (no processing)', async () => {
    mockVerifyWebhookSignature.mockRejectedValue(new Error('bad sig'));

    const body: PlaidWebhookBody = {
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'item-abc',
      error: null,
    };
    const reply = makeReply();
    const request = makeRequest(body);

    await handleWebhook(request, reply as unknown as FastifyReply);
    await new Promise<void>((resolve) => setImmediate(resolve));

    // No processing should happen if verification fails
    expect(mockGetItemForSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleTransactionsWebhook
// ---------------------------------------------------------------------------

describe('handleTransactionsWebhook', () => {
  it('calls syncTransactions with userId and itemId for SYNC_UPDATES_AVAILABLE', async () => {
    await handleTransactionsWebhook('user-1', 'item-abc', 'SYNC_UPDATES_AVAILABLE');

    expect(mockSyncTransactions).toHaveBeenCalledWith('user-1', 'item-abc');
  });

  it('does NOT call syncTransactions for INITIAL_UPDATE (legacy code from deprecated /transactions/get API)', async () => {
    await handleTransactionsWebhook('user-1', 'item-abc', 'INITIAL_UPDATE');

    expect(mockSyncTransactions).not.toHaveBeenCalled();
  });

  it('does NOT call syncTransactions for HISTORICAL_UPDATE (legacy code from deprecated /transactions/get API)', async () => {
    await handleTransactionsWebhook('user-1', 'item-abc', 'HISTORICAL_UPDATE');

    expect(mockSyncTransactions).not.toHaveBeenCalled();
  });

  it('returns void', async () => {
    const result = await handleTransactionsWebhook('user-1', 'item-abc', 'SYNC_UPDATES_AVAILABLE');

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handleItemWebhook
// ---------------------------------------------------------------------------

describe('handleItemWebhook', () => {
  it('calls handleLoginRequired with itemId when webhook_code is ITEM_LOGIN_REQUIRED', async () => {
    await handleItemWebhook('item-abc', 'user-1', 'ITEM_LOGIN_REQUIRED');

    expect(mockHandleLoginRequired).toHaveBeenCalledWith('item-abc');
  });

  it('does NOT call handleLoginRequired for PENDING_EXPIRATION', async () => {
    await handleItemWebhook('item-abc', 'user-1', 'PENDING_EXPIRATION');

    expect(mockHandleLoginRequired).not.toHaveBeenCalled();
  });

  it('returns void', async () => {
    const result = await handleItemWebhook('item-abc', 'user-1', 'ITEM_LOGIN_REQUIRED');

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handleWebhook — event routing (fire-and-forget settled)
// ---------------------------------------------------------------------------

describe('handleWebhook — event routing', () => {
  it('routes TRANSACTIONS webhook to syncTransactions after verification', async () => {
    const body: PlaidWebhookBody = {
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'item-abc',
      error: null,
    };
    const request = makeRequest(body);
    const reply = makeReply();

    await handleWebhook(request, reply as unknown as FastifyReply);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockSyncTransactions).toHaveBeenCalledWith('user-1', 'item-abc');
  });

  it('does not call any sync for TRANSACTIONS/INITIAL_UPDATE (ignored webhook code)', async () => {
    const body: PlaidWebhookBody = {
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'INITIAL_UPDATE',
      item_id: 'item-abc',
      error: null,
    };
    const request = makeRequest(body);
    const reply = makeReply();

    await handleWebhook(request, reply as unknown as FastifyReply);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockSyncTransactions).not.toHaveBeenCalled();
  });

  it('routes ITEM/ITEM_LOGIN_REQUIRED to handleLoginRequired', async () => {
    const body: PlaidWebhookBody = {
      webhook_type: 'ITEM',
      webhook_code: 'ITEM_LOGIN_REQUIRED',
      item_id: 'item-abc',
      error: { error_type: 'ITEM_ERROR', error_code: 'ITEM_LOGIN_REQUIRED', error_message: 'Login required', display_message: null },
    };
    const request = makeRequest(body);
    const reply = makeReply();

    await handleWebhook(request, reply as unknown as FastifyReply);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockHandleLoginRequired).toHaveBeenCalledWith('item-abc');
  });
});
