/**
 * @module transactions.route.test
 * @description HTTP integration tests for the /api/transactions route plugin.
 * Exercises auth middleware, schema validation, and category filtering
 * with the transactions service fully mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import errorHandlerPlugin from '../../../plugins/errorHandler.plugin.js';
import cookie from '@fastify/cookie';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../modules/auth/auth-tokens.repository.js', () => ({
  isAccessTokenRevoked: vi.fn().mockResolvedValue(false),
  isSessionsInvalidatedForUser: vi.fn().mockResolvedValue(false),
}));

vi.mock('../transactions.service.js', () => ({
  getTransactionsSince: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import transactionRoutes from '../transactions.route.js';
import * as transactionsService from '../transactions.service.js';

const mockGetTransactionsSince = vi.mocked(transactionsService.getTransactionsSince);

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'transactions-route-test-secret';
const TEST_USER_ID = 'user-route-txns-1';

/** Signs a JWT matching the production auth plugin's expected shape. */
function signToken(userId = TEST_USER_ID): string {
  return jwt.sign({ userId, email: 'test@example.com', jti: 'test-jti' }, TEST_SECRET, { expiresIn: '15m' });
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(cookie);
  await app.register(transactionRoutes, { prefix: '/api/transactions' });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    userId: TEST_USER_ID,
    sortKey: '2024-06-15#txn-1',
    plaidTransactionId: 'txn-1',
    plaidAccountId: 'acct-1',
    amount: 50,
    date: '2024-06-15',
    name: 'Payment',
    merchantName: null,
    category: 'LOAN_PAYMENTS',
    detailedCategory: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
    categoryIconUrl: null,
    pending: false,
    isoCurrencyCode: 'USD',
    unofficialCurrencyCode: null,
    createdAt: '2024-06-15T00:00:00.000Z',
    updatedAt: '2024-06-15T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = TEST_SECRET;
});

// ---------------------------------------------------------------------------
// GET /api/transactions
// ---------------------------------------------------------------------------

describe('GET /api/transactions', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/transactions',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns all transactions when no category param is provided', async () => {
    const loanTx = makeTx({ category: 'LOAN_PAYMENTS' });
    const groceryTx = makeTx({ sortKey: '2024-06-14#txn-2', category: 'FOOD_AND_DRINK' });
    mockGetTransactionsSince.mockResolvedValue([loanTx, groceryTx]);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/transactions',
      cookies: { accessToken: signToken() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().transactions).toHaveLength(2);
  });

  it('returns only transactions matching category when param is provided', async () => {
    const loanTx = makeTx({ category: 'LOAN_PAYMENTS' });
    const groceryTx = makeTx({ sortKey: '2024-06-14#txn-2', category: 'FOOD_AND_DRINK' });
    mockGetTransactionsSince.mockResolvedValue([loanTx, groceryTx]);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/transactions?category=LOAN_PAYMENTS',
      cookies: { accessToken: signToken() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().transactions).toHaveLength(1);
    expect(res.json().transactions[0].category).toBe('LOAN_PAYMENTS');
  });

  it('returns empty array when category matches nothing', async () => {
    const groceryTx = makeTx({ category: 'FOOD_AND_DRINK' });
    mockGetTransactionsSince.mockResolvedValue([groceryTx]);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/transactions?category=LOAN_PAYMENTS',
      cookies: { accessToken: signToken() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().transactions).toHaveLength(0);
  });
});
