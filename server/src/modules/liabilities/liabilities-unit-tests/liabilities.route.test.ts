/**
 * @module liabilities.route.test
 * @description HTTP integration tests for the /api/liabilities route plugin.
 * Exercises auth middleware and end-to-end request flow with the
 * liabilities service fully mocked.
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

vi.mock('../liabilities.service.js', () => ({
  getLiabilitiesForUser: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import liabilitiesRoutes from '../liabilities.route.js';
import * as liabilitiesService from '../liabilities.service.js';
import type { CreditLiability } from '../liabilities.types.js';

const mockGetLiabilitiesForUser = vi.mocked(liabilitiesService.getLiabilitiesForUser);

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'liabilities-route-test-secret';
const TEST_USER_ID = 'user-route-liabilities-1';

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
  await app.register(liabilitiesRoutes, { prefix: '/api/liabilities' });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleLiability: CreditLiability = {
  userId: TEST_USER_ID,
  sortKey: 'acct-credit-1#01ABC',
  plaidAccountId: 'acct-credit-1',
  currentBalance: null,
  liabilityType: 'credit',
  details: {
    minimumPaymentAmount: 35,
    nextPaymentDueDate: '2024-07-15',
    lastPaymentAmount: 50,
    lastStatementBalance: 1200,
    aprs: [{ aprPercentage: 24.99, aprType: 'purchase', balanceSubjectToApr: 1200, interestChargeAmount: 25 }],
  },
  createdAt: '2024-06-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = TEST_SECRET;
});

// ---------------------------------------------------------------------------
// GET /api/liabilities
// ---------------------------------------------------------------------------

describe('GET /api/liabilities', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/liabilities',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with liabilities array on success', async () => {
    app = await buildTestApp();
    mockGetLiabilitiesForUser.mockResolvedValue([sampleLiability]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/liabilities',
      cookies: { accessToken: signToken() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().liabilities).toHaveLength(1);
    expect(res.json().liabilities[0].liabilityType).toBe('credit');
  });

  it('returns 200 with empty array when no liabilities exist', async () => {
    app = await buildTestApp();
    mockGetLiabilitiesForUser.mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/liabilities',
      cookies: { accessToken: signToken() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().liabilities).toHaveLength(0);
  });

  it('calls getLiabilitiesForUser with the correct userId from JWT', async () => {
    app = await buildTestApp();
    mockGetLiabilitiesForUser.mockResolvedValue([]);

    await app.inject({
      method: 'GET',
      url: '/api/liabilities',
      cookies: { accessToken: signToken('custom-user-99') },
    });

    expect(mockGetLiabilitiesForUser).toHaveBeenCalledWith('custom-user-99');
  });
});
