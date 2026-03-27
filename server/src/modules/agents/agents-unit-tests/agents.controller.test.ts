/**
 * @module agents.controller.test
 * @description Unit tests for agents.controller handler functions.
 * The agents service is fully mocked — tests verify that handlers correctly
 * extract userId/params/body from the request, delegate to the service, and
 * reply with the correct status code and payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

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

import {
  runBudgetAgent,
  runDebtAgent,
  runInvestingAgent,
  getProposal,
  getProposalHistory,
  approveProposal,
  rejectProposal,
  executeProposal,
} from '../agents.controller.js';
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
// Minimal Fastify request/reply stubs
// ---------------------------------------------------------------------------

/** Creates a minimal request stub with an authenticated user. */
function makeRequest(overrides: Record<string, unknown> = {}): any {
  return {
    user: { userId: 'user-ctrl-1', email: 'test@test.com' },
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}

/** Creates a minimal reply stub that captures send/status calls. */
function makeReply(): any {
  const reply: Record<string, unknown> = {};
  reply.send = vi.fn().mockReturnValue(reply);
  reply.status = vi.fn().mockReturnValue(reply);
  return reply;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleProposal: Proposal = {
  userId: 'user-ctrl-1',
  proposalId: '01ABC',
  agentType: 'budget',
  status: 'pending',
  result: { summary: 'test', rationale: 'test', income: 5000, housing: 1500, utilities: 200, transportation: 300, groceries: 400, takeout: 150, shopping: 250, personalCare: 100, emergencyFund: 0, entertainment: 0, medical: 0, debts: 500, investments: 300 },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// runBudgetAgent
// ---------------------------------------------------------------------------

describe('runBudgetAgent controller', () => {
  it('calls service.runBudgetAgent with userId from JWT', async () => {
    mockRunBudgetAgent.mockResolvedValue(sampleProposal);
    const reply = makeReply();

    await runBudgetAgent(makeRequest(), reply);

    expect(mockRunBudgetAgent).toHaveBeenCalledWith('user-ctrl-1');
  });

  it('replies with 201 and the proposal', async () => {
    mockRunBudgetAgent.mockResolvedValue(sampleProposal);
    const reply = makeReply();

    await runBudgetAgent(makeRequest(), reply);

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(reply.send).toHaveBeenCalledWith(sampleProposal);
  });
});

// ---------------------------------------------------------------------------
// runDebtAgent
// ---------------------------------------------------------------------------

describe('runDebtAgent controller', () => {
  it('calls service.runDebtAgent with userId and debtAllocation from body', async () => {
    mockRunDebtAgent.mockResolvedValue({ ...sampleProposal, agentType: 'debt' });
    const reply = makeReply();

    await runDebtAgent(makeRequest({ body: { debtAllocation: 500 } }), reply);

    expect(mockRunDebtAgent).toHaveBeenCalledWith('user-ctrl-1', 500);
  });

  it('replies with 201', async () => {
    mockRunDebtAgent.mockResolvedValue({ ...sampleProposal, agentType: 'debt' });
    const reply = makeReply();

    await runDebtAgent(makeRequest({ body: { debtAllocation: 500 } }), reply);

    expect(reply.status).toHaveBeenCalledWith(201);
  });
});

// ---------------------------------------------------------------------------
// runInvestingAgent
// ---------------------------------------------------------------------------

describe('runInvestingAgent controller', () => {
  it('calls service.runInvestingAgent with userId and investingAllocation from body', async () => {
    mockRunInvestingAgent.mockResolvedValue({ ...sampleProposal, agentType: 'investing' });
    const reply = makeReply();

    await runInvestingAgent(makeRequest({ body: { investingAllocation: 300 } }), reply);

    expect(mockRunInvestingAgent).toHaveBeenCalledWith('user-ctrl-1', 300);
  });
});

// ---------------------------------------------------------------------------
// getProposal
// ---------------------------------------------------------------------------

describe('getProposal controller', () => {
  it('calls service.getProposal with userId and proposalId from params', async () => {
    mockGetProposal.mockResolvedValue(sampleProposal);
    const reply = makeReply();

    await getProposal(makeRequest({ params: { proposalId: '01ABC' } }), reply);

    expect(mockGetProposal).toHaveBeenCalledWith('user-ctrl-1', '01ABC');
  });

  it('replies with 200 and the proposal', async () => {
    mockGetProposal.mockResolvedValue(sampleProposal);
    const reply = makeReply();

    await getProposal(makeRequest({ params: { proposalId: '01ABC' } }), reply);

    expect(reply.send).toHaveBeenCalledWith(sampleProposal);
  });
});

// ---------------------------------------------------------------------------
// getProposalHistory
// ---------------------------------------------------------------------------

describe('getProposalHistory controller', () => {
  it('calls service.getProposalHistory when no agentType query', async () => {
    mockGetProposalHistory.mockResolvedValue([sampleProposal]);
    const reply = makeReply();

    await getProposalHistory(makeRequest({ query: {} }), reply);

    expect(mockGetProposalHistory).toHaveBeenCalledWith('user-ctrl-1');
  });

  it('calls service.getProposalsByType when agentType is provided', async () => {
    mockGetProposalsByType.mockResolvedValue([]);
    const reply = makeReply();

    await getProposalHistory(makeRequest({ query: { agentType: 'debt' } }), reply);

    expect(mockGetProposalsByType).toHaveBeenCalledWith('user-ctrl-1', 'debt');
  });
});

// ---------------------------------------------------------------------------
// approveProposal
// ---------------------------------------------------------------------------

describe('approveProposal controller', () => {
  it('calls service.approveProposal with userId and proposalId', async () => {
    mockApproveProposal.mockResolvedValue({ ...sampleProposal, status: 'approved' });
    const reply = makeReply();

    await approveProposal(makeRequest({ params: { proposalId: '01ABC' } }), reply);

    expect(mockApproveProposal).toHaveBeenCalledWith('user-ctrl-1', '01ABC');
    expect(reply.send).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// rejectProposal
// ---------------------------------------------------------------------------

describe('rejectProposal controller', () => {
  it('calls service.rejectProposal with userId and proposalId', async () => {
    mockRejectProposal.mockResolvedValue({ ...sampleProposal, status: 'rejected' });
    const reply = makeReply();

    await rejectProposal(makeRequest({ params: { proposalId: '01ABC' } }), reply);

    expect(mockRejectProposal).toHaveBeenCalledWith('user-ctrl-1', '01ABC');
    expect(reply.send).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// executeProposal
// ---------------------------------------------------------------------------

describe('executeProposal controller', () => {
  it('calls service.executeProposal with userId and proposalId', async () => {
    mockExecuteProposal.mockResolvedValue({ ...sampleProposal, status: 'executed' });
    const reply = makeReply();

    await executeProposal(makeRequest({ params: { proposalId: '01ABC' } }), reply);

    expect(mockExecuteProposal).toHaveBeenCalledWith('user-ctrl-1', '01ABC');
    expect(reply.send).toHaveBeenCalled();
  });
});
