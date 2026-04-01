/**
 * @module investments.route.test
 * @description HTTP integration tests for the /api/investments route plugin.
 * Exercises auth middleware, schema validation, and end-to-end request flow
 * with the investments service fully mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import errorHandlerPlugin from '../../../plugins/errorHandler.plugin.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../modules/auth/auth-tokens.repository.js', () => ({
  isAccessTokenRevoked: vi.fn().mockResolvedValue(false),
  isSessionsInvalidatedForUser: vi.fn().mockResolvedValue(false),
}));

vi.mock('../investments.service.js', () => ({
  getLatestHoldings: vi.fn(),
  getTransactionsSince: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import investmentRoutes from '../investments.route.js';
import * as investmentsService from '../investments.service.js';
import type { Holding } from '../investments.types.js';

const mockGetLatestHoldings = vi.mocked(investmentsService.getLatestHoldings);

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'investments-route-test-secret';
const TEST_USER_ID = 'user-route-investments-1';

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
  await app.register(investmentRoutes, { prefix: '/api/investments' });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleHolding: Holding = {
  userId: TEST_USER_ID,
  snapshotDateAccountSecurity: '2024-06-15#acct-1#sec-1',
  plaidAccountId: 'acct-1',
  securityId: 'sec-1',
  snapshotDate: '2024-06-15',
  quantity: 10,
  institutionPrice: 150.25,
  institutionValue: 1502.5,
  costBasis: 1200,
  isoCurrencyCode: 'USD',
  unofficialCurrencyCode: null,
  securityName: 'Schwab Total Stock Market',
  tickerSymbol: 'SWTSX',
  securityType: 'mutual fund',
  closePrice: 149.80,
  closePriceAsOf: '2024-06-14',
  isin: null,
  cusip: null,
  createdAt: '2024-06-15T12:00:00.000Z',
  updatedAt: '2024-06-15T12:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = TEST_SECRET;
});

// ---------------------------------------------------------------------------
// GET /api/investments/holdings
// ---------------------------------------------------------------------------

describe('GET /api/investments/holdings', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/investments/holdings',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with holdings array on success', async () => {
    app = await buildTestApp();
    mockGetLatestHoldings.mockResolvedValue([sampleHolding]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/investments/holdings',
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().holdings).toHaveLength(1);
    expect(res.json().holdings[0].tickerSymbol).toBe('SWTSX');
  });

  it('returns 200 with empty array when no holdings exist', async () => {
    app = await buildTestApp();
    mockGetLatestHoldings.mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/investments/holdings',
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().holdings).toHaveLength(0);
  });

  it('calls getLatestHoldings with the correct userId from JWT', async () => {
    app = await buildTestApp();
    mockGetLatestHoldings.mockResolvedValue([]);

    await app.inject({
      method: 'GET',
      url: '/api/investments/holdings',
      headers: { authorization: `Bearer ${signToken('custom-user-42')}` },
    });

    expect(mockGetLatestHoldings).toHaveBeenCalledWith('custom-user-42');
  });
});
