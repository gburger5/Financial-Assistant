/**
 * @module budget.route.test
 * @description HTTP integration tests for the /api/budget route plugin.
 * Exercises schema validation, middleware wiring, and end-to-end request flow
 * with the budget service fully mocked so no real DynamoDB or computation occurs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import errorHandlerPlugin from '../../../plugins/errorHandler.plugin.js';
import { NotFoundError } from '../../../lib/errors.js';
import type { BudgetGoal } from '../budget.types.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../budget.service.js', () => ({
  createInitialBudget: vi.fn(),
  updateBudget: vi.fn(),
  getLatestBudget: vi.fn(),
  getBudgetHistory: vi.fn(),
}));

// Mock revocation check so verifyJWT doesn't hit DynamoDB
vi.mock('../../../modules/auth/auth-tokens.repository.js', () => ({
  isAccessTokenRevoked: vi.fn().mockResolvedValue(false),
  isSessionsInvalidatedForUser: vi.fn().mockResolvedValue(false),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import budgetRoutes from '../budget.route.js';
import * as budgetService from '../budget.service.js';

const mockCreateInitialBudget = vi.mocked(budgetService.createInitialBudget);
const mockGetLatestBudget = vi.mocked(budgetService.getLatestBudget);
const mockUpdateBudget = vi.mocked(budgetService.updateBudget);
const mockGetBudgetHistory = vi.mocked(budgetService.getBudgetHistory);

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'budget-route-test-secret';
const TEST_USER_ID = 'user-route-123';

/** Signs a JWT that matches the production auth plugin's expected shape. */
function signToken(userId = TEST_USER_ID): string {
  // CHANGE 2: added jti claim — verifyJWT rejects tokens without it
  return jwt.sign({ userId, email: 'test@example.com', jti: 'test-jti' }, TEST_SECRET, { expiresIn: '15m' });
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

/**
 * Builds a minimal Fastify app with the error handler and budget routes.
 * Mirrors the production registration pattern: prefix /api/budget so
 * routes resolve to /api/budget and /api/budget/history.
 */
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(budgetRoutes, { prefix: '/api/budget' });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const testGoals: BudgetGoal[] = ['pay down debt', 'maximize investments'];

const sampleBudget = {
  userId: TEST_USER_ID,
  budgetId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  createdAt: '2024-01-01T00:00:00.000Z',
  income: { amount: 5000 },
  housing: { amount: 1500 },
  utilities: { amount: 200 },
  transportation: { amount: 300 },
  groceries: { amount: 400 },
  takeout: { amount: 150 },
  shopping: { amount: 250 },
  personalCare: { amount: 100 },
  emergencyFund: { amount: 0 },
  entertainment: { amount: 0 },
  medical: { amount: 0 },
  debts: { amount: 500 },
  investments: { amount: 300 },
  goals: testGoals,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = TEST_SECRET;
});

// ---------------------------------------------------------------------------
// POST /api/budget/initialize
// ---------------------------------------------------------------------------

describe('POST /api/budget/initialize', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/budget/initialize',
      payload: { goals: testGoals },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    app = await buildTestApp();
    const token = jwt.sign({ userId: 'u-1', email: 'a@b.com' }, 'wrong-secret');

    const res = await app.inject({
      method: 'POST',
      url: '/api/budget/initialize',
      headers: { authorization: `Bearer ${token}` },
      payload: { goals: testGoals },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when goals is missing from the body', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/budget/initialize',
      headers: { authorization: `Bearer ${signToken()}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when goals is an empty array (minItems: 1)', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/budget/initialize',
      headers: { authorization: `Bearer ${signToken()}` },
      payload: { goals: [] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when goals contains an invalid string', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/budget/initialize',
      headers: { authorization: `Bearer ${signToken()}` },
      payload: { goals: ['not a real goal'] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 201 with the created budget on success', async () => {
    mockCreateInitialBudget.mockResolvedValue(sampleBudget);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/budget/initialize',
      headers: { authorization: `Bearer ${signToken()}` },
      payload: { goals: testGoals },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ userId: TEST_USER_ID });
  });

  it('calls createInitialBudget with the authenticated userId and goals from the body', async () => {
    mockCreateInitialBudget.mockResolvedValue(sampleBudget);
    app = await buildTestApp();

    await app.inject({
      method: 'POST',
      url: '/api/budget/initialize',
      headers: { authorization: `Bearer ${signToken(TEST_USER_ID)}` },
      payload: { goals: testGoals },
    });

    expect(mockCreateInitialBudget).toHaveBeenCalledWith(TEST_USER_ID, testGoals);
  });
});

// ---------------------------------------------------------------------------
// GET /api/budget
// ---------------------------------------------------------------------------

describe('GET /api/budget', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/api/budget' });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    app = await buildTestApp();
    const token = jwt.sign({ userId: 'u-1', email: 'a@b.com' }, 'wrong-secret');

    const res = await app.inject({
      method: 'GET',
      url: '/api/budget',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when service throws NotFoundError', async () => {
    mockGetLatestBudget.mockRejectedValue(
      new NotFoundError('Connect a bank account to get started'),
    );
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/budget',
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('Connect a bank account to get started');
  });

  it('returns 200 with the budget on success', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/budget',
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      userId: TEST_USER_ID,
      budgetId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    });
  });

  it('calls the service with the authenticated userId from the JWT', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);
    app = await buildTestApp();

    await app.inject({
      method: 'GET',
      url: '/api/budget',
      headers: { authorization: `Bearer ${signToken(TEST_USER_ID)}` },
    });

    expect(mockGetLatestBudget).toHaveBeenCalledWith(TEST_USER_ID);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/budget
// ---------------------------------------------------------------------------

describe('PATCH /api/budget', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      payload: { groceries: { amount: 500 } },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when amount is negative (schema: minimum 0)', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      payload: { groceries: { amount: -1 } },
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when amount is not a number', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      payload: { groceries: { amount: 'lots' } },
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when service throws NotFoundError', async () => {
    mockUpdateBudget.mockRejectedValue(new NotFoundError('No budget found'));
    app = await buildTestApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      payload: { groceries: { amount: 500 } },
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with the updated budget on success', async () => {
    const updated = { ...sampleBudget, groceries: { amount: 999 } };
    mockUpdateBudget.mockResolvedValue(updated);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      payload: { groceries: { amount: 999 } },
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().groceries.amount).toBe(999);
  });

  it('strips system fields from the body before reaching the service (additionalProperties: false)', async () => {
    mockUpdateBudget.mockResolvedValue(sampleBudget);
    app = await buildTestApp();

    await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      payload: {
        groceries: { amount: 500 },
        userId: 'attacker-injected',   // system field — must be stripped
        budgetId: 'fake-id',           // system field — must be stripped
        createdAt: '1970-01-01',       // system field — must be stripped
      },
      headers: { authorization: `Bearer ${signToken(TEST_USER_ID)}` },
    });

    expect(mockUpdateBudget).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.not.objectContaining({ userId: 'attacker-injected', budgetId: 'fake-id' }),
    );
  });

  it('passes only the validated category fields to the service', async () => {
    mockUpdateBudget.mockResolvedValue(sampleBudget);
    app = await buildTestApp();

    await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      payload: { groceries: { amount: 500 } },
      headers: { authorization: `Bearer ${signToken(TEST_USER_ID)}` },
    });

    expect(mockUpdateBudget).toHaveBeenCalledWith(TEST_USER_ID, { groceries: { amount: 500 } });
  });

  it('accepts an empty body (all categories optional in BudgetUpdateInput)', async () => {
    mockUpdateBudget.mockResolvedValue(sampleBudget);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      payload: {},
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it('accepts zero as a valid amount (minimum: 0 allows it)', async () => {
    mockUpdateBudget.mockResolvedValue(sampleBudget);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      payload: { groceries: { amount: 0 } },
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it('accepts valid goals in the request body', async () => {
    const updated = { ...sampleBudget, goals: ['pay down debt', 'save for big purchase'] as BudgetGoal[] };
    mockUpdateBudget.mockResolvedValue(updated);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      payload: { goals: ['pay down debt', 'save for big purchase'] },
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().goals).toEqual(['pay down debt', 'save for big purchase']);
  });

  it('returns 400 when goals contains an invalid string', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      payload: { goals: ['invalid goal'] },
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when goals contains a non-string value', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      payload: { goals: [123] },
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(400);
  });

  it('passes goals to the service alongside category fields', async () => {
    mockUpdateBudget.mockResolvedValue(sampleBudget);
    app = await buildTestApp();

    await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      payload: { goals: ['build a strong emergency fund'], groceries: { amount: 500 } },
      headers: { authorization: `Bearer ${signToken(TEST_USER_ID)}` },
    });

    expect(mockUpdateBudget).toHaveBeenCalledWith(TEST_USER_ID, {
      goals: ['build a strong emergency fund'],
      groceries: { amount: 500 },
    });
  });

  it('accepts an empty goals array', async () => {
    mockUpdateBudget.mockResolvedValue({ ...sampleBudget, goals: [] });
    app = await buildTestApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      payload: { goals: [] },
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/budget/history
// ---------------------------------------------------------------------------

describe('GET /api/budget/history', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/api/budget/history' });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    app = await buildTestApp();
    const token = jwt.sign({ userId: 'u-1', email: 'a@b.com' }, 'wrong-secret');

    const res = await app.inject({
      method: 'GET',
      url: '/api/budget/history',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with an empty array when no history exists', async () => {
    mockGetBudgetHistory.mockResolvedValue([]);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/budget/history',
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns 200 with the budget history array', async () => {
    mockGetBudgetHistory.mockResolvedValue([sampleBudget]);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/budget/history',
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it('calls the service with the authenticated userId from the JWT', async () => {
    mockGetBudgetHistory.mockResolvedValue([]);
    app = await buildTestApp();

    await app.inject({
      method: 'GET',
      url: '/api/budget/history',
      headers: { authorization: `Bearer ${signToken(TEST_USER_ID)}` },
    });

    expect(mockGetBudgetHistory).toHaveBeenCalledWith(TEST_USER_ID);
  });
});
