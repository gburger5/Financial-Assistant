/**
 * @module plaid.route.test
 * @description HTTP integration tests for the /api/plaid route plugin.
 * Exercises schema validation, middleware wiring, and end-to-end request flow
 * with the plaid service and webhook module fully mocked so no real Plaid API
 * calls, DynamoDB writes, or signature verification occurs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import errorHandlerPlugin from '../../../plugins/errorHandler.plugin.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../plaid.service.js', () => ({
  createLinkToken: vi.fn(),
  linkBankAccount: vi.fn(),
}));

vi.mock('../plaid.webhook.js', () => ({
  handleWebhook: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import plaidRoutes from '../plaid.route.js';
import * as plaidService from '../plaid.service.js';
import * as plaidWebhook from '../plaid.webhook.js';

const mockCreateLinkToken = vi.mocked(plaidService.createLinkToken);
const mockLinkBankAccount = vi.mocked(plaidService.linkBankAccount);
const mockHandleWebhook = vi.mocked(plaidWebhook.handleWebhook);

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'plaid-route-test-secret';
const TEST_USER_ID = 'user-uuid-123';

/** Signs a JWT that matches the production auth plugin's expected shape. */
function signToken(userId = TEST_USER_ID): string {
  return jwt.sign({ userId, email: 'test@example.com' }, TEST_SECRET, { expiresIn: '15m' });
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

/**
 * Builds a minimal Fastify app with the error handler and plaid routes.
 * Mirrors the production app registration pattern.
 */
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(plaidRoutes, { prefix: '/api/plaid' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = TEST_SECRET;
});

// ---------------------------------------------------------------------------
// GET /api/plaid/link-token
// ---------------------------------------------------------------------------

describe('GET /api/plaid/link-token', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/api/plaid/link-token' });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    app = await buildTestApp();
    const token = jwt.sign({ userId: 'u-1', email: 'a@b.com' }, 'wrong-secret');

    const res = await app.inject({
      method: 'GET',
      url: '/api/plaid/link-token',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it('calls createLinkToken and returns 200 with the link token on success', async () => {
    mockCreateLinkToken.mockResolvedValue({ linkToken: 'link-sandbox-abc123' } as never);
    app = await buildTestApp();
    const token = signToken();

    const res = await app.inject({
      method: 'GET',
      url: '/api/plaid/link-token',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ linkToken: 'link-sandbox-abc123' });
  });

  it('passes the authenticated userId to createLinkToken', async () => {
    mockCreateLinkToken.mockResolvedValue({ linkToken: 'link-sandbox-abc123' } as never);
    app = await buildTestApp();
    const token = signToken(TEST_USER_ID);

    await app.inject({
      method: 'GET',
      url: '/api/plaid/link-token',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(mockCreateLinkToken).toHaveBeenCalledWith(TEST_USER_ID);
  });
});

// ---------------------------------------------------------------------------
// POST /api/plaid/exchange-token
// ---------------------------------------------------------------------------

describe('POST /api/plaid/exchange-token', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/plaid/exchange-token',
      payload: { publicToken: 'pub-tok', institutionId: 'ins-1', institutionName: 'Bank' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when publicToken is missing from the body', async () => {
    app = await buildTestApp();
    const token = signToken();

    const res = await app.inject({
      method: 'POST',
      url: '/api/plaid/exchange-token',
      payload: { institutionId: 'ins-1', institutionName: 'Bank' },
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when institutionId is missing from the body', async () => {
    app = await buildTestApp();
    const token = signToken();

    const res = await app.inject({
      method: 'POST',
      url: '/api/plaid/exchange-token',
      payload: { publicToken: 'pub-tok', institutionName: 'Bank' },
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when institutionName is missing from the body', async () => {
    app = await buildTestApp();
    const token = signToken();

    const res = await app.inject({
      method: 'POST',
      url: '/api/plaid/exchange-token',
      payload: { publicToken: 'pub-tok', institutionId: 'ins-1' },
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
  });

  it('calls linkBankAccount with userId, publicToken, institutionId, institutionName', async () => {
    mockLinkBankAccount.mockResolvedValue({
      message: 'Bank account linked successfully',
      itemId: 'item-xyz',
    });
    app = await buildTestApp();
    const token = signToken(TEST_USER_ID);

    await app.inject({
      method: 'POST',
      url: '/api/plaid/exchange-token',
      payload: { publicToken: 'pub-tok', institutionId: 'ins-1', institutionName: 'Chase' },
      headers: { authorization: `Bearer ${token}` },
    });

    expect(mockLinkBankAccount).toHaveBeenCalledWith(
      TEST_USER_ID,
      'pub-tok',
      'ins-1',
      'Chase',
    );
  });

  it('returns 200 with the linkBankAccount result on success', async () => {
    mockLinkBankAccount.mockResolvedValue({
      message: 'Bank account linked successfully',
      itemId: 'item-xyz',
    });
    app = await buildTestApp();
    const token = signToken();

    const res = await app.inject({
      method: 'POST',
      url: '/api/plaid/exchange-token',
      payload: { publicToken: 'pub-tok', institutionId: 'ins-1', institutionName: 'Chase' },
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      message: 'Bank account linked successfully',
      itemId: 'item-xyz',
    });
  });

  it('strips extra body fields before reaching the service (additionalProperties: false)', async () => {
    mockLinkBankAccount.mockResolvedValue({
      message: 'Bank account linked successfully',
      itemId: 'item-xyz',
    });
    app = await buildTestApp();
    const token = signToken(TEST_USER_ID);

    await app.inject({
      method: 'POST',
      url: '/api/plaid/exchange-token',
      payload: {
        publicToken: 'pub-tok',
        institutionId: 'ins-1',
        institutionName: 'Chase',
        userId: 'attacker-injected-id', // must be stripped
      },
      headers: { authorization: `Bearer ${token}` },
    });

    // The service is called with the authenticated userId, not the injected one
    expect(mockLinkBankAccount).toHaveBeenCalledWith(TEST_USER_ID, 'pub-tok', 'ins-1', 'Chase');
  });
});

// ---------------------------------------------------------------------------
// POST /api/plaid/webhook
// ---------------------------------------------------------------------------

describe('POST /api/plaid/webhook', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 200 with { received: true } for a valid webhook', async () => {
    // The handleWebhook mock drives the reply
    mockHandleWebhook.mockImplementation(async (_req, reply) => {
      return reply.status(200).send({ received: true });
    });
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/plaid/webhook',
      payload: {
        webhook_type: 'TRANSACTIONS',
        webhook_code: 'SYNC_UPDATES_AVAILABLE',
        item_id: 'item-abc',
        error: null,
      },
      headers: { 'content-type': 'application/json' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
  });

  it('does not require an Authorization header (Plaid calls this, not users)', async () => {
    mockHandleWebhook.mockImplementation(async (_req, reply) => {
      return reply.status(200).send({ received: true });
    });
    app = await buildTestApp();

    // No authorization header — must succeed (or return 200)
    const res = await app.inject({
      method: 'POST',
      url: '/api/plaid/webhook',
      payload: { webhook_type: 'ITEM', webhook_code: 'ITEM_LOGIN_REQUIRED', item_id: 'i-1', error: null },
      headers: { 'content-type': 'application/json' },
    });

    // 200 or whatever the mock returns — importantly NOT 401
    expect(res.statusCode).not.toBe(401);
  });

  it('delegates to the handleWebhook function from plaid.webhook', async () => {
    mockHandleWebhook.mockImplementation(async (_req, reply) => {
      return reply.status(200).send({ received: true });
    });
    app = await buildTestApp();

    await app.inject({
      method: 'POST',
      url: '/api/plaid/webhook',
      payload: { webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'item-abc', error: null },
      headers: { 'content-type': 'application/json' },
    });

    expect(mockHandleWebhook).toHaveBeenCalledTimes(1);
  });
});
