import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { FastifyInstance } from 'fastify';
import { getApp, closeApp } from './helpers.js';

vi.mock('../services/budget.js', () => ({
  getBudget: vi.fn(),
  updateBudget: vi.fn(),
  confirmBudget: vi.fn(),
  createEmptyBudget: vi.fn(),
}));

vi.mock('../services/auth.js', () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  getUserById: vi.fn(),
}));

import { getBudget, updateBudget, confirmBudget } from '../services/budget.js';

const mockGetBudget = vi.mocked(getBudget);
const mockUpdateBudget = vi.mocked(updateBudget);
const mockConfirmBudget = vi.mocked(confirmBudget);

const JWT_SECRET = 'test-secret-key';
const TEST_USER_ID = 'user-budget-route-test';
const BUDGET_ID = 'budget-ROUTETEST';
const AUTH_TOKEN = jwt.sign(
  { userId: TEST_USER_ID, email: 'test@example.com', firstName: 'Test', lastName: 'User' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

function makeBudget(overrides = {}) {
  return {
    userId: TEST_USER_ID,
    budgetId: BUDGET_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    name: 'Monthly Budget',
    status: 'PENDING' as const,
    income: { monthlyNet: null },
    needs: {
      housing: { rentOrMortgage: null },
      utilities: { utilities: null },
      transportation: { carPayment: null, gasFuel: null },
      other: { groceries: null, personalCare: null },
    },
    wants: { takeout: null, shopping: null },
    investments: { monthlyContribution: null },
    ...overrides,
  };
}

describe('Budget routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    await closeApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── GET /budget ──────────────────────────────────────────────────────────

  describe('GET /budget', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const response = await app.inject({ method: 'GET', url: '/budget' });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when no budget exists for the user', async () => {
      mockGetBudget.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: '/budget',
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('No budget found');
    });

    it('returns the budget wrapped in a budget key', async () => {
      const budget = makeBudget({ income: { monthlyNet: 5000 } });
      mockGetBudget.mockResolvedValueOnce(budget);

      const response = await app.inject({
        method: 'GET',
        url: '/budget',
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.budget).toEqual(budget);
      expect(mockGetBudget).toHaveBeenCalledWith(TEST_USER_ID);
    });
  });

  // ─── PUT /budget/:budgetId ────────────────────────────────────────────────

  describe('PUT /budget/:budgetId', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/budget/${BUDGET_ID}`,
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 when updateBudget throws "Budget not found"', async () => {
      mockUpdateBudget.mockRejectedValueOnce(new Error('Budget not found'));

      const response = await app.inject({
        method: 'PUT',
        url: `/budget/${BUDGET_ID}`,
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { income: { monthlyNet: 5000 } },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Budget not found');
    });

    it('returns the updated budget on success', async () => {
      const updated = makeBudget({ income: { monthlyNet: 5000 }, status: 'REVIEWED' as const });
      mockUpdateBudget.mockResolvedValueOnce(updated);

      const response = await app.inject({
        method: 'PUT',
        url: `/budget/${BUDGET_ID}`,
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { income: { monthlyNet: 5000 } },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.budget).toEqual(updated);
      expect(mockUpdateBudget).toHaveBeenCalledWith(
        TEST_USER_ID,
        BUDGET_ID,
        expect.objectContaining({ income: { monthlyNet: 5000 } })
      );
    });

    it('passes the request body and route param to updateBudget', async () => {
      mockUpdateBudget.mockResolvedValueOnce(makeBudget());

      await app.inject({
        method: 'PUT',
        url: `/budget/${BUDGET_ID}`,
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { name: 'Updated Name' },
      });

      expect(mockUpdateBudget).toHaveBeenCalledWith(
        TEST_USER_ID,
        BUDGET_ID,
        expect.objectContaining({ name: 'Updated Name' })
      );
    });
  });

  // ─── POST /budget/:budgetId/confirm ───────────────────────────────────────

  describe('POST /budget/:budgetId/confirm', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/budget/${BUDGET_ID}/confirm`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns { confirmed: true } on success', async () => {
      mockConfirmBudget.mockResolvedValueOnce(undefined);

      const response = await app.inject({
        method: 'POST',
        url: `/budget/${BUDGET_ID}/confirm`,
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.confirmed).toBe(true);
      expect(mockConfirmBudget).toHaveBeenCalledWith(TEST_USER_ID, BUDGET_ID);
    });

    it('returns 400 when confirmBudget throws', async () => {
      mockConfirmBudget.mockRejectedValueOnce(new Error('DynamoDB error'));

      const response = await app.inject({
        method: 'POST',
        url: `/budget/${BUDGET_ID}/confirm`,
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('DynamoDB error');
    });
  });
});
