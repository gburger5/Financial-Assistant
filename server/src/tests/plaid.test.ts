import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { FastifyInstance } from 'fastify';
import { getApp, closeApp } from './helpers.js';

vi.mock('../services/plaid.js', () => ({
  createLinkToken: vi.fn(),
  exchangePublicToken: vi.fn(),
  syncTransactions: vi.fn(),
  syncInvestmentTransactions: vi.fn(),
}));

vi.mock('../services/budget.js', () => ({
  analyzeAndPopulateBudget: vi.fn(),
  createEmptyBudget: vi.fn(),
  getBudget: vi.fn(),
  updateBudget: vi.fn(),
  confirmBudget: vi.fn(),
}));

vi.mock('../services/auth.js', () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock('../lib/encryption.js', () => ({
  encryptToken: vi.fn((token: string) => `enc:${token}`),
  decryptToken: vi.fn((token: string) => token.replace(/^enc:/, '')),
}));

import { createLinkToken, exchangePublicToken, syncTransactions, syncInvestmentTransactions } from '../services/plaid.js';
import { analyzeAndPopulateBudget } from '../services/budget.js';
import { getUserById } from '../services/auth.js';

const mockCreateLinkToken = vi.mocked(createLinkToken);
const mockExchangePublicToken = vi.mocked(exchangePublicToken);
const mockSyncTransactions = vi.mocked(syncTransactions);
const mockSyncInvestmentTransactions = vi.mocked(syncInvestmentTransactions);
const mockAnalyzeAndPopulateBudget = vi.mocked(analyzeAndPopulateBudget);
const mockGetUserById = vi.mocked(getUserById);

const JWT_SECRET = 'test-secret-key';
const TEST_USER_ID = 'user-route-test';
const AUTH_TOKEN = jwt.sign(
  { userId: TEST_USER_ID, email: 'test@example.com', firstName: 'Test', lastName: 'User' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const MOCK_BUDGET = {
  userId: TEST_USER_ID,
  budgetId: 'budget#TEST',
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
};

describe('Plaid routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    await closeApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Investment sync returns empty by default — individual tests override when needed
    mockSyncInvestmentTransactions.mockResolvedValue([]);
  });

  // ─── POST /plaid/create-link-token ────────────────────────────────────────

  describe('POST /plaid/create-link-token', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plaid/create-link-token',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns the link_token on success', async () => {
      mockCreateLinkToken.mockResolvedValueOnce('link-sandbox-abc123');

      const response = await app.inject({
        method: 'POST',
        url: '/plaid/create-link-token',
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.link_token).toBe('link-sandbox-abc123');
      expect(mockCreateLinkToken).toHaveBeenCalledWith(TEST_USER_ID);
    });

    it('returns 500 when createLinkToken throws', async () => {
      mockCreateLinkToken.mockRejectedValueOnce(new Error('Plaid unavailable'));

      const response = await app.inject({
        method: 'POST',
        url: '/plaid/create-link-token',
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to create link token');
    });
  });

  // ─── POST /plaid/exchange-token ───────────────────────────────────────────

  describe('POST /plaid/exchange-token', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plaid/exchange-token',
        payload: { public_token: 'public-sandbox-xyz' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 when public_token is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/plaid/exchange-token',
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('public_token is required');
    });

    it('returns budget and banksConnected=1 for a first-time user with no existing banks', async () => {
      mockExchangePublicToken.mockResolvedValueOnce({
        accessToken: 'raw-access-token',
        itemId: 'item-001',
      });
      mockGetUserById.mockResolvedValueOnce(null);
      mockSyncTransactions.mockResolvedValueOnce([]);
      mockAnalyzeAndPopulateBudget.mockResolvedValueOnce(MOCK_BUDGET);

      const response = await app.inject({
        method: 'POST',
        url: '/plaid/exchange-token',
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { public_token: 'public-sandbox-xyz' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.banksConnected).toBe(1);
      expect(body.budget).toEqual(MOCK_BUDGET);

      // syncTransactions called once with the raw (unencrypted) token
      expect(mockSyncTransactions).toHaveBeenCalledOnce();
      expect(mockSyncTransactions).toHaveBeenCalledWith('raw-access-token');

      // syncInvestmentTransactions also called for the same account
      expect(mockSyncInvestmentTransactions).toHaveBeenCalledOnce();
      expect(mockSyncInvestmentTransactions).toHaveBeenCalledWith('raw-access-token');

      // the token stored via analyzeAndPopulateBudget must be encrypted
      expect(mockAnalyzeAndPopulateBudget).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ accessToken: 'enc:raw-access-token' }),
        [],
        []
      );
    });

    it('decrypts existing stored tokens before syncing and returns the combined bank count', async () => {
      mockExchangePublicToken.mockResolvedValueOnce({
        accessToken: 'new-raw-token',
        itemId: 'item-002',
      });
      mockGetUserById.mockResolvedValueOnce({
        plaidItems: [
          { accessToken: 'enc:existing-token-1', itemId: 'item-old-1', linkedAt: '2025-01-01T00:00:00.000Z' },
          { accessToken: 'enc:existing-token-2', itemId: 'item-old-2', linkedAt: '2025-01-02T00:00:00.000Z' },
        ],
      });
      mockSyncTransactions.mockResolvedValue([]);
      mockAnalyzeAndPopulateBudget.mockResolvedValueOnce(MOCK_BUDGET);

      const response = await app.inject({
        method: 'POST',
        url: '/plaid/exchange-token',
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { public_token: 'public-sandbox-new' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.banksConnected).toBe(3);

      // existing encrypted tokens should be decrypted before calling syncTransactions
      expect(mockSyncTransactions).toHaveBeenCalledTimes(3);
      expect(mockSyncTransactions).toHaveBeenCalledWith('existing-token-1');
      expect(mockSyncTransactions).toHaveBeenCalledWith('existing-token-2');
      expect(mockSyncTransactions).toHaveBeenCalledWith('new-raw-token');

      // investment sync also called for all 3 banks with decrypted tokens
      expect(mockSyncInvestmentTransactions).toHaveBeenCalledTimes(3);
      expect(mockSyncInvestmentTransactions).toHaveBeenCalledWith('existing-token-1');
      expect(mockSyncInvestmentTransactions).toHaveBeenCalledWith('existing-token-2');
      expect(mockSyncInvestmentTransactions).toHaveBeenCalledWith('new-raw-token');

      // new item token must be encrypted before storage
      expect(mockAnalyzeAndPopulateBudget).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ accessToken: 'enc:new-raw-token' }),
        [],
        []
      );
    });

    it('passes investment transactions to analyzeAndPopulateBudget', async () => {
      const mockInvTx = {
        investment_transaction_id: 'inv-1',
        amount: -500,
        date: '2025-01-15',
        type: 'transfer',
        subtype: 'contribution',
        name: '401K',
      };

      mockExchangePublicToken.mockResolvedValueOnce({
        accessToken: 'raw-token',
        itemId: 'item-001',
      });
      mockGetUserById.mockResolvedValueOnce(null);
      mockSyncTransactions.mockResolvedValueOnce([]);
      mockSyncInvestmentTransactions.mockResolvedValueOnce([mockInvTx]);
      mockAnalyzeAndPopulateBudget.mockResolvedValueOnce({
        ...MOCK_BUDGET,
        investments: { monthlyContribution: 500 },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/plaid/exchange-token',
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { public_token: 'public-sandbox-xyz' },
      });

      expect(response.statusCode).toBe(200);
      // investment transactions forwarded as the 4th argument
      expect(mockAnalyzeAndPopulateBudget).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ accessToken: 'enc:raw-token' }),
        [],
        [mockInvTx]
      );
      const body = JSON.parse(response.body);
      expect(body.budget.investments.monthlyContribution).toBe(500);
    });

    it('returns 500 when exchangePublicToken throws', async () => {
      mockExchangePublicToken.mockRejectedValueOnce(new Error('Invalid public token'));

      const response = await app.inject({
        method: 'POST',
        url: '/plaid/exchange-token',
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { public_token: 'bad-token' },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to link bank account');
    });
  });
});
