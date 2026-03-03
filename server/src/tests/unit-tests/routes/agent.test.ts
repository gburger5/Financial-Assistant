import { vi, describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// 1. DynamoDB client
vi.mock('../../../lib/db.js', () => ({
  db: { send: vi.fn() },
}));

// 2. Budget service
vi.mock('../../../services/budget.js', () => ({
  getBudget: vi.fn(),
}));

// 3. Auth service
vi.mock('../../../services/auth.js', () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  getUserById: vi.fn(),
}));

// 4. Encryption
vi.mock('../../../lib/encryption.js', () => ({
  decryptToken: vi.fn(() => 'decrypted-access-token'),
}));

// 5. Plaid client
vi.mock('../../../lib/plaid.js', () => ({
  plaidClient: {
    liabilitiesGet: vi.fn(),
    investmentsHoldingsGet: vi.fn(),
  },
}));

// 6. ULID
vi.mock('ulid', () => ({
  ulid: vi.fn(() => 'MOCK_ULID'),
}));

// 7. Auth middleware — bypass JWT, stamp req.user
vi.mock('../../../middleware/auth.js', () => ({
  verifyToken: vi.fn(async (req: any) => {
    req.user = {
      userId: 'user-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      jti: 'token-id',
    };
  }),
}));

// 8. Global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Source imports (after mocks) ──────────────────────────────────────────────

import { buildApp } from '../../../app.js';
import { db } from '../../../lib/db.js';
import { getBudget } from '../../../services/budget.js';
import { getUserById } from '../../../services/auth.js';
import { plaidClient } from '../../../lib/plaid.js';
import type { FastifyInstance } from 'fastify';

const mockSend = vi.mocked(db.send);
const mockGetBudget = vi.mocked(getBudget);
const mockGetUserById = vi.mocked(getUserById);
const mockPlaidLiabilities = vi.mocked(plaidClient.liabilitiesGet);
const mockPlaidInvestments = vi.mocked(plaidClient.investmentsHoldingsGet);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-123';

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    proposalId: 'prop-1',
    userId: USER_ID,
    type: 'budget',
    status: 'pending',
    summary: 'Test proposal',
    rationale: 'Because tests',
    payload: { debtAllocation: '200', investingAllocation: '300' },
    budget: {},
    totalAllocation: '500',
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBudget() {
  return {
    userId: USER_ID,
    budgetId: 'budget#MOCK_ULID',
    status: 'PENDING',
    income: { monthlyNet: 5000 },
    needs: {
      housing: { rentOrMortgage: 1500 },
      utilities: { utilities: 200 },
      transportation: { carPayment: 300, gasFuel: 100 },
      other: { groceries: 400, personalCare: 50 },
    },
    wants: { takeout: 100, shopping: 150 },
    investments: { monthlyContribution: 300 },
    debts: { minimumPayments: 200 },
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    name: 'Monthly Budget',
  };
}

function mockFetchOk(body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => body,
  } as Response);
}

function mockFetchError(status: number, text: string) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => text,
  } as Response);
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: user has a Plaid item
  mockGetUserById.mockResolvedValue({
    id: USER_ID,
    plaidItems: [{ accessToken: 'enc-token', linkedAt: '2025-01-01T00:00:00.000Z' }],
    dateOfBirth: '1990-05-15',
  } as any);
});

// ── POST /agent/budget ────────────────────────────────────────────────────────

describe('POST /agent/budget', () => {
  it('happy path — returns proposal from agent', async () => {
    const budget = makeBudget();
    const proposal = makeProposal();
    mockGetBudget.mockResolvedValueOnce(budget as any);
    mockFetchOk(proposal);

    const res = await app.inject({ method: 'POST', url: '/agent/budget' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.proposal).toMatchObject({ proposalId: 'prop-1' });
  });

  it('404 when no budget found', async () => {
    mockGetBudget.mockResolvedValueOnce(null);

    const res = await app.inject({ method: 'POST', url: '/agent/budget' });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/No budget found/);
  });

  it('502 when agent service is unreachable', async () => {
    mockGetBudget.mockResolvedValueOnce(makeBudget() as any);
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const res = await app.inject({ method: 'POST', url: '/agent/budget' });

    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Agent service unreachable');
  });

  it('502 when agent returns non-ok response', async () => {
    mockGetBudget.mockResolvedValueOnce(makeBudget() as any);
    mockFetchError(500, 'Internal Server Error');

    const res = await app.inject({ method: 'POST', url: '/agent/budget' });

    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Agent service error');
  });
});

// ── POST /agent/budget/:proposalId/respond ────────────────────────────────────

describe('POST /agent/budget/:proposalId/respond', () => {
  describe('approve flow (approved: true)', () => {
    it('happy path — executes proposal and triggers agents', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: makeProposal() })  // GetCommand
        .mockResolvedValueOnce({})                         // UpdateCommand (proposal → executed)
        .mockResolvedValueOnce({})                         // PutCommand (budget)
        .mockResolvedValueOnce({});                        // UpdateCommand (user onboarding)

      // fire-and-forget agents succeed
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      const res = await app.inject({
        method: 'POST',
        url: '/agent/budget/prop-1/respond',
        payload: { approved: true },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({ success: true });
      // db.send called at least 4 times (get + 3 writes)
      expect(mockSend).toHaveBeenCalledTimes(4);
    });

    it('404 when proposal not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const res = await app.inject({
        method: 'POST',
        url: '/agent/budget/missing/respond',
        payload: { approved: true },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Proposal not found');
    });
  });

  describe('reject flow (approved: false)', () => {
    it('happy path — rejects and returns revised proposal', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: makeProposal() })  // GetCommand
        .mockResolvedValueOnce({});                        // UpdateCommand (proposal → rejected)

      mockGetBudget.mockResolvedValueOnce(makeBudget() as any);
      const revisedProposal = makeProposal({ proposalId: 'prop-2', status: 'pending' });
      mockFetchOk(revisedProposal);

      const res = await app.inject({
        method: 'POST',
        url: '/agent/budget/prop-1/respond',
        payload: { approved: false, rejectionReason: 'Too high' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.proposal).toMatchObject({ proposalId: 'prop-2' });
    });

    it('502 when revision agent is unreachable', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: makeProposal() })
        .mockResolvedValueOnce({});

      mockGetBudget.mockResolvedValueOnce(makeBudget() as any);
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await app.inject({
        method: 'POST',
        url: '/agent/budget/prop-1/respond',
        payload: { approved: false, rejectionReason: 'Too high' },
      });

      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Agent service unreachable');
    });

    it('502 when revision agent returns error', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: makeProposal() })
        .mockResolvedValueOnce({});

      mockGetBudget.mockResolvedValueOnce(makeBudget() as any);
      mockFetchError(500, 'Internal Server Error');

      const res = await app.inject({
        method: 'POST',
        url: '/agent/budget/prop-1/respond',
        payload: { approved: false, rejectionReason: 'Too high' },
      });

      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Agent service error');
    });
  });
});

// ── POST /agent/debt/:proposalId/respond ──────────────────────────────────────

describe('POST /agent/debt/:proposalId/respond', () => {
  const debtProposal = makeProposal({
    type: 'debt',
    payload: { totalAllocation: '200' },
    plaidTransactions: [],
  });

  describe('approve flow', () => {
    it('happy path — queues transactions', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: debtProposal })  // GetCommand
        .mockResolvedValueOnce({});                      // UpdateCommand

      const res = await app.inject({
        method: 'POST',
        url: '/agent/debt/prop-1/respond',
        payload: { approved: true },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({ success: true });

      // Verify UpdateCommand includes txnStatus and pendingTransactions
      const updateInput = mockSend.mock.calls[1][0].input;
      expect(updateInput.UpdateExpression).toContain('pendingTransactions');
      expect(updateInput.UpdateExpression).toContain('txnStatus');
      expect(updateInput.ExpressionAttributeValues[':queued']).toBe('queued');
    });

    it('404 when proposal not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const res = await app.inject({
        method: 'POST',
        url: '/agent/debt/missing/respond',
        payload: { approved: true },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('reject flow', () => {
    it('happy path — triggers debt agent and returns new proposal', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: debtProposal })  // GetCommand
        .mockResolvedValueOnce({});                      // UpdateCommand (rejected)

      // Plaid liabilities — PRODUCTS_NOT_SUPPORTED → gracefully skipped
      mockPlaidLiabilities.mockRejectedValueOnce({
        response: { data: { error_code: 'PRODUCTS_NOT_SUPPORTED' } },
      });

      const newProposal = makeProposal({ proposalId: 'debt-prop-2' });
      mockFetchOk(newProposal);

      const res = await app.inject({
        method: 'POST',
        url: '/agent/debt/prop-1/respond',
        payload: { approved: false, rejectionReason: 'Reduce payments' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.proposal).toMatchObject({ proposalId: 'debt-prop-2' });
    });

    it('502 when debt agent throws', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: debtProposal })
        .mockResolvedValueOnce({});

      mockPlaidLiabilities.mockRejectedValueOnce({
        response: { data: { error_code: 'PRODUCTS_NOT_SUPPORTED' } },
      });
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const res = await app.inject({
        method: 'POST',
        url: '/agent/debt/prop-1/respond',
        payload: { approved: false, rejectionReason: 'Reduce payments' },
      });

      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Agent service error on revision');
    });
  });
});

// ── POST /agent/investing/:proposalId/respond ─────────────────────────────────

describe('POST /agent/investing/:proposalId/respond', () => {
  const investingProposal = makeProposal({
    type: 'investing',
    payload: { totalAllocation: '300' },
    plaidTransactions: [],
  });

  describe('approve flow', () => {
    it('happy path — queues transactions', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: investingProposal })
        .mockResolvedValueOnce({});

      const res = await app.inject({
        method: 'POST',
        url: '/agent/investing/prop-1/respond',
        payload: { approved: true },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({ success: true });

      const updateInput = mockSend.mock.calls[1][0].input;
      expect(updateInput.ExpressionAttributeValues[':queued']).toBe('queued');
    });

    it('404 when proposal not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const res = await app.inject({
        method: 'POST',
        url: '/agent/investing/missing/respond',
        payload: { approved: true },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('reject flow', () => {
    it('happy path — triggers investing agent and returns new proposal', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: investingProposal })
        .mockResolvedValueOnce({});

      // Plaid holdings — no investment accounts → gracefully skipped
      mockPlaidInvestments.mockRejectedValueOnce({
        response: { data: { error_code: 'PRODUCTS_NOT_SUPPORTED' } },
      });

      const newProposal = makeProposal({ proposalId: 'inv-prop-2' });
      mockFetchOk(newProposal);

      const res = await app.inject({
        method: 'POST',
        url: '/agent/investing/prop-1/respond',
        payload: { approved: false, rejectionReason: 'Riskier allocation' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.proposal).toMatchObject({ proposalId: 'inv-prop-2' });
    });

    it('502 when investing agent throws', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: investingProposal })
        .mockResolvedValueOnce({});

      mockPlaidInvestments.mockRejectedValueOnce({
        response: { data: { error_code: 'PRODUCTS_NOT_SUPPORTED' } },
      });
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const res = await app.inject({
        method: 'POST',
        url: '/agent/investing/prop-1/respond',
        payload: { approved: false, rejectionReason: 'Riskier allocation' },
      });

      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Agent service error on revision');
    });
  });
});

// ── GET /proposals ────────────────────────────────────────────────────────────

describe('GET /proposals', () => {
  function makeProposalItem(id: string, createdAt: string) {
    return { proposalId: id, userId: USER_ID, createdAt, type: 'budget', status: 'pending' };
  }

  it('returns all proposals sorted by createdAt desc', async () => {
    const items = [
      makeProposalItem('p1', '2025-01-01T00:00:00.000Z'),
      makeProposalItem('p2', '2025-03-01T00:00:00.000Z'),
      makeProposalItem('p3', '2025-02-01T00:00:00.000Z'),
    ];
    mockSend.mockResolvedValueOnce({ Items: items });

    const res = await app.inject({ method: 'GET', url: '/proposals' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.proposals[0].proposalId).toBe('p2');
    expect(body.proposals[1].proposalId).toBe('p3');
    expect(body.proposals[2].proposalId).toBe('p1');
  });

  it('filters by type — passes FilterExpression to DynamoDB', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    await app.inject({ method: 'GET', url: '/proposals?type=budget' });

    const scanInput = mockSend.mock.calls[0][0].input;
    expect(scanInput.FilterExpression).toContain('#t = :type');
    expect(scanInput.ExpressionAttributeValues[':type']).toBe('budget');
    expect(scanInput.ExpressionAttributeNames['#t']).toBe('type');
  });

  it('filters by status — passes FilterExpression to DynamoDB', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    await app.inject({ method: 'GET', url: '/proposals?status=pending' });

    const scanInput = mockSend.mock.calls[0][0].input;
    expect(scanInput.FilterExpression).toContain('#s = :status');
    expect(scanInput.ExpressionAttributeValues[':status']).toBe('pending');
    expect(scanInput.ExpressionAttributeNames['#s']).toBe('status');
  });

  it('returns empty array when no proposals found', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    const res = await app.inject({ method: 'GET', url: '/proposals' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.proposals).toEqual([]);
  });
});
