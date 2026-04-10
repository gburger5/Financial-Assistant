/**
 * @module agents.route.test
 * @description HTTP integration tests for the /api/agent route plugin.
 * Exercises schema validation, middleware wiring, and end-to-end request flow
 * with the agents service fully mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import errorHandlerPlugin from '../../../plugins/errorHandler.plugin.js';
import cookie from '@fastify/cookie';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock revocation check so verifyJWT doesn't hit DynamoDB
vi.mock('../../../modules/auth/auth-tokens.repository.js', () => ({
  isAccessTokenRevoked: vi.fn().mockResolvedValue(false),
  isSessionsInvalidatedForUser: vi.fn().mockResolvedValue(false),
}));

vi.mock('../agents.service.js', () => ({
  runBudgetAgent: vi.fn(),
  runDebtAgent: vi.fn(),
  runInvestingAgent: vi.fn(),
  getProposal: vi.fn(),
  getProposalHistory: vi.fn(),
  getProposalsByType: vi.fn(),
  approveProposal: vi.fn(),
  rejectProposal: vi.fn(),
  executeProposal: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import agentRoutes from '../agents.route.js';
import * as agentsService from '../agents.service.js';
import type { Proposal } from '../agents.types.js';

const mockRunBudgetAgent = vi.mocked(agentsService.runBudgetAgent);
const mockRunDebtAgent = vi.mocked(agentsService.runDebtAgent);
const mockRunInvestingAgent = vi.mocked(agentsService.runInvestingAgent);
const mockGetProposal = vi.mocked(agentsService.getProposal);
const mockGetProposalHistory = vi.mocked(agentsService.getProposalHistory);
const mockGetProposalsByType = vi.mocked(agentsService.getProposalsByType);
const mockApproveProposal = vi.mocked(agentsService.approveProposal);
const mockRejectProposal = vi.mocked(agentsService.rejectProposal);
const mockExecuteProposal = vi.mocked(agentsService.executeProposal);

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'agent-route-test-secret';
const TEST_USER_ID = 'user-route-agent-1';

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
  await app.register(agentRoutes, { prefix: '/api/agent' });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleProposal: Proposal = {
  userId: TEST_USER_ID,
  proposalId: '01ABC',
  agentType: 'budget',
  status: 'pending',
  result: { summary: 'test', rationale: 'test', income: 5000, housing: 1500, utilities: 200, transportation: 300, groceries: 400, takeout: 150, shopping: 250, personalCare: 100, emergencyFund: 0, entertainment: 0, medical: 0, debts: 500, investments: 300 },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = TEST_SECRET;
});

// ---------------------------------------------------------------------------
// POST /api/agent/budget
// ---------------------------------------------------------------------------

describe('POST /api/agent/budget', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/budget',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 201 with the proposal on success', async () => {
    app = await buildTestApp();
    mockRunBudgetAgent.mockResolvedValue(sampleProposal);

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/budget',
      cookies: { accessToken: signToken() },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().proposalId).toBe('01ABC');
  });
});

// ---------------------------------------------------------------------------
// POST /api/agent/debt
// ---------------------------------------------------------------------------

describe('POST /api/agent/debt', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/debt',
      payload: { debtAllocation: 500 },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 201 with the proposal on success', async () => {
    app = await buildTestApp();
    mockRunDebtAgent.mockResolvedValue({ ...sampleProposal, agentType: 'debt' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/debt',
      cookies: { accessToken: signToken() },
      payload: { debtAllocation: 500 },
    });

    expect(res.statusCode).toBe(201);
    expect(mockRunDebtAgent).toHaveBeenCalledWith(TEST_USER_ID, 500);
  });

  it('returns 400 when debtAllocation is missing', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/debt',
      cookies: { accessToken: signToken() },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when debtAllocation is negative', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/debt',
      cookies: { accessToken: signToken() },
      payload: { debtAllocation: -100 },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/agent/investing
// ---------------------------------------------------------------------------

describe('POST /api/agent/investing', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 201 with the proposal on success', async () => {
    app = await buildTestApp();
    mockRunInvestingAgent.mockResolvedValue({ ...sampleProposal, agentType: 'investing' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/investing',
      cookies: { accessToken: signToken() },
      payload: { investingAllocation: 300 },
    });

    expect(res.statusCode).toBe(201);
    expect(mockRunInvestingAgent).toHaveBeenCalledWith(TEST_USER_ID, 300);
  });

  it('returns 400 when investingAllocation is missing', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/investing',
      cookies: { accessToken: signToken() },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agent/proposals
// ---------------------------------------------------------------------------

describe('GET /api/agent/proposals', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 without auth', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/agent/proposals',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with all proposals when no agentType query', async () => {
    app = await buildTestApp();
    mockGetProposalHistory.mockResolvedValue([sampleProposal]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/agent/proposals',
      cookies: { accessToken: signToken() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it('filters by agentType when query param is provided', async () => {
    app = await buildTestApp();
    mockGetProposalsByType.mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/agent/proposals?agentType=debt',
      cookies: { accessToken: signToken() },
    });

    expect(res.statusCode).toBe(200);
    expect(mockGetProposalsByType).toHaveBeenCalledWith(TEST_USER_ID, 'debt');
  });
});

// ---------------------------------------------------------------------------
// GET /api/agent/proposals/:proposalId
// ---------------------------------------------------------------------------

describe('GET /api/agent/proposals/:proposalId', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 200 with the proposal', async () => {
    app = await buildTestApp();
    mockGetProposal.mockResolvedValue(sampleProposal);

    const res = await app.inject({
      method: 'GET',
      url: '/api/agent/proposals/01ABC',
      cookies: { accessToken: signToken() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().proposalId).toBe('01ABC');
  });
});

// ---------------------------------------------------------------------------
// POST /api/agent/proposals/:proposalId/approve
// ---------------------------------------------------------------------------

describe('POST /api/agent/proposals/:proposalId/approve', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 200 with the approved proposal', async () => {
    app = await buildTestApp();
    mockApproveProposal.mockResolvedValue({ ...sampleProposal, status: 'approved' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/proposals/01ABC/approve',
      cookies: { accessToken: signToken() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('approved');
  });
});

// ---------------------------------------------------------------------------
// POST /api/agent/proposals/:proposalId/reject
// ---------------------------------------------------------------------------

describe('POST /api/agent/proposals/:proposalId/reject', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 200 with the rejected proposal', async () => {
    app = await buildTestApp();
    mockRejectProposal.mockResolvedValue({ ...sampleProposal, status: 'rejected' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/proposals/01ABC/reject',
      cookies: { accessToken: signToken() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------
// POST /api/agent/proposals/:proposalId/execute
// ---------------------------------------------------------------------------

describe('POST /api/agent/proposals/:proposalId/execute', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 200 with the executed proposal', async () => {
    app = await buildTestApp();
    mockExecuteProposal.mockResolvedValue({ ...sampleProposal, status: 'executed' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/proposals/01ABC/execute',
      cookies: { accessToken: signToken() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('executed');
  });
});
