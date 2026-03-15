/**
 * @module budget.controller.test
 * @description Unit tests for budget.controller handler functions.
 * The budget service is fully mocked — tests verify that handlers correctly
 * extract userId from request.user, delegate to the service, and reply with
 * the service's return value. No HTTP layer is exercised here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError } from '../../../lib/errors.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../budget.service.js', () => ({
  createInitialBudget: vi.fn(),
  getLatestBudget: vi.fn(),
  updateBudget: vi.fn(),
  getBudgetHistory: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  getBudget,
  initializeBudget,
  patchBudget,
  getHistory,
} from '../budget.controller.js';
import * as budgetService from '../budget.service.js';
import type { Budget } from '../budget.types.js';

const mockCreateInitialBudget = vi.mocked(budgetService.createInitialBudget);
const mockGetLatestBudget = vi.mocked(budgetService.getLatestBudget);
const mockUpdateBudget = vi.mocked(budgetService.updateBudget);
const mockGetBudgetHistory = vi.mocked(budgetService.getBudgetHistory);

// ---------------------------------------------------------------------------
// Minimal Fastify request/reply stubs
// ---------------------------------------------------------------------------

/** Creates a minimal request stub with an authenticated user. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRequest(overrides: Record<string, unknown> = {}): any {
  return {
    user: { userId: 'user-ctrl-1', email: 'test@example.com' },
    body: {},
    ...overrides,
  };
}

/** Creates a minimal reply stub that captures send/status calls. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeReply(): any {
  const reply: Record<string, unknown> = {};
  reply.send = vi.fn().mockReturnValue(reply);
  reply.status = vi.fn().mockReturnValue(reply);
  return reply;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleBudget: Budget = {
  userId: 'user-ctrl-1',
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
  debts: { amount: 500 },
  investments: { amount: 300 },
  goals: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// initializeBudget
// ---------------------------------------------------------------------------

describe('initializeBudget', () => {
  it('calls createInitialBudget with the authenticated userId', async () => {
    mockCreateInitialBudget.mockResolvedValue(sampleBudget);
    const req = makeRequest();
    const reply = makeReply();

    await initializeBudget(req, reply);

    expect(mockCreateInitialBudget).toHaveBeenCalledWith('user-ctrl-1');
  });

  it('replies with status 201', async () => {
    mockCreateInitialBudget.mockResolvedValue(sampleBudget);
    const req = makeRequest();
    const reply = makeReply();

    await initializeBudget(req, reply);

    expect(reply.status).toHaveBeenCalledWith(201);
  });

  it('sends the created budget in the reply', async () => {
    mockCreateInitialBudget.mockResolvedValue(sampleBudget);
    const req = makeRequest();
    const reply = makeReply();

    await initializeBudget(req, reply);

    expect(reply.send).toHaveBeenCalledWith(sampleBudget);
  });
});

// ---------------------------------------------------------------------------
// getBudget
// ---------------------------------------------------------------------------

describe('getBudget', () => {
  it('calls getLatestBudget with the authenticated userId', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);
    const req = makeRequest();
    const reply = makeReply();

    await getBudget(req, reply);

    expect(mockGetLatestBudget).toHaveBeenCalledWith('user-ctrl-1');
  });

  it('throws NotFoundError when no budget exists (service returns null)', async () => {
    mockGetLatestBudget.mockResolvedValue(null);
    const req = makeRequest();
    const reply = makeReply();

    await expect(getBudget(req, reply)).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError with the "Connect a bank account" message', async () => {
    mockGetLatestBudget.mockResolvedValue(null);
    const req = makeRequest();
    const reply = makeReply();

    await expect(getBudget(req, reply)).rejects.toThrow('Connect a bank account to get started');
  });

  it('sends the budget in the reply on success', async () => {
    mockGetLatestBudget.mockResolvedValue(sampleBudget);
    const req = makeRequest();
    const reply = makeReply();

    await getBudget(req, reply);

    expect(reply.send).toHaveBeenCalledWith(sampleBudget);
  });
});

// ---------------------------------------------------------------------------
// patchBudget
// ---------------------------------------------------------------------------

describe('patchBudget', () => {
  it('calls updateBudget with the authenticated userId and request body', async () => {
    const update = { groceries: { amount: 999 } };
    mockUpdateBudget.mockResolvedValue({ ...sampleBudget, ...update });
    const req = makeRequest({ body: update });
    const reply = makeReply();

    await patchBudget(req, reply);

    expect(mockUpdateBudget).toHaveBeenCalledWith('user-ctrl-1', update);
  });

  it('sends the updated budget in the reply', async () => {
    const updated: Budget = { ...sampleBudget, groceries: { amount: 999 } };
    mockUpdateBudget.mockResolvedValue(updated);
    const req = makeRequest({ body: { groceries: { amount: 999 } } });
    const reply = makeReply();

    await patchBudget(req, reply);

    expect(reply.send).toHaveBeenCalledWith(updated);
  });

  it('propagates NotFoundError from the service without catching it', async () => {
    mockUpdateBudget.mockRejectedValue(new NotFoundError('No budget found'));
    const req = makeRequest({ body: {} });
    const reply = makeReply();

    await expect(patchBudget(req, reply)).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// getHistory
// ---------------------------------------------------------------------------

describe('getHistory', () => {
  it('calls getBudgetHistory with the authenticated userId', async () => {
    mockGetBudgetHistory.mockResolvedValue([sampleBudget]);
    const req = makeRequest();
    const reply = makeReply();

    await getHistory(req, reply);

    expect(mockGetBudgetHistory).toHaveBeenCalledWith('user-ctrl-1');
  });

  it('sends the budget history array in the reply', async () => {
    mockGetBudgetHistory.mockResolvedValue([sampleBudget]);
    const req = makeRequest();
    const reply = makeReply();

    await getHistory(req, reply);

    expect(reply.send).toHaveBeenCalledWith([sampleBudget]);
  });

  it('sends an empty array when no history exists', async () => {
    mockGetBudgetHistory.mockResolvedValue([]);
    const req = makeRequest();
    const reply = makeReply();

    await getHistory(req, reply);

    expect(reply.send).toHaveBeenCalledWith([]);
  });
});
