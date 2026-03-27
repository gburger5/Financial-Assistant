/**
 * @module agents.repository.test
 * @description Unit tests for agents.repository — DynamoDB persistence for proposals.
 * The db client is fully mocked so no real DynamoDB calls occur.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factory — must exist before vi.mock() factory functions run
// ---------------------------------------------------------------------------

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../db/index.js', () => ({ db: { send: mockSend } }));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  saveProposal,
  getProposalById,
  getLatestProposal,
  getPendingProposal,
  getProposalHistory,
  getProposalsByType,
  updateProposalStatus,
} from '../agents.repository.js';
import type { Proposal } from '../agents.types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleProposal: Proposal = {
  userId: 'user-agent-1',
  proposalId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  agentType: 'budget',
  status: 'pending',
  result: {
    summary: 'Test summary',
    rationale: 'Test rationale',
    income: 5000,
    housing: 1500,
    utilities: 200,
    transportation: 300,
    groceries: 400,
    takeout: 150,
    shopping: 250,
    personalCare: 100,
    emergencyFund: 0,
    entertainment: 0,
    medical: 0,
    debts: 500,
    investments: 300,
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// saveProposal
// ---------------------------------------------------------------------------

describe('saveProposal', () => {
  it('calls db.send exactly once', async () => {
    mockSend.mockResolvedValue({});

    await saveProposal(sampleProposal);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('stores the proposal in the Proposals table', async () => {
    mockSend.mockResolvedValue({});

    await saveProposal(sampleProposal);

    const command = mockSend.mock.calls[0][0];
    expect(command.input.TableName).toBe('Proposals');
  });

  it('stores the full proposal item including userId and proposalId', async () => {
    mockSend.mockResolvedValue({});

    await saveProposal(sampleProposal);

    const command = mockSend.mock.calls[0][0];
    expect(command.input.Item).toMatchObject({
      userId: 'user-agent-1',
      proposalId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      agentType: 'budget',
      status: 'pending',
    });
  });
});

// ---------------------------------------------------------------------------
// getProposalById
// ---------------------------------------------------------------------------

describe('getProposalById', () => {
  it('returns null when no proposal exists', async () => {
    mockSend.mockResolvedValue({ Item: undefined });

    const result = await getProposalById('user-agent-1', 'nonexistent');

    expect(result).toBeNull();
  });

  it('returns the proposal when it exists', async () => {
    mockSend.mockResolvedValue({ Item: sampleProposal });

    const result = await getProposalById('user-agent-1', '01ARZ3NDEKTSV4RRFFQ69G5FAV');

    expect(result).toMatchObject({
      userId: 'user-agent-1',
      proposalId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    });
  });

  it('queries with the correct key', async () => {
    mockSend.mockResolvedValue({ Item: undefined });

    await getProposalById('user-agent-1', '01ARZ3NDEKTSV4RRFFQ69G5FAV');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.TableName).toBe('Proposals');
    expect(command.input.Key).toEqual({
      userId: 'user-agent-1',
      proposalId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    });
  });
});

// ---------------------------------------------------------------------------
// getLatestProposal
// ---------------------------------------------------------------------------

describe('getLatestProposal', () => {
  it('returns null when no proposals exist for the agent type', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    const result = await getLatestProposal('user-agent-1', 'budget');

    expect(result).toBeNull();
  });

  it('returns the first matching proposal', async () => {
    mockSend.mockResolvedValue({ Items: [sampleProposal] });

    const result = await getLatestProposal('user-agent-1', 'budget');

    expect(result).toMatchObject({ proposalId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' });
  });

  it('uses ScanIndexForward: false to get newest first', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await getLatestProposal('user-agent-1', 'budget');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.ScanIndexForward).toBe(false);
  });

  it('applies a FilterExpression for agentType', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await getLatestProposal('user-agent-1', 'debt');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.FilterExpression).toContain('agentType');
    expect(command.input.ExpressionAttributeValues[':agentType']).toBe('debt');
  });

  it('returns null when Items is undefined in the response', async () => {
    mockSend.mockResolvedValue({});

    const result = await getLatestProposal('user-agent-1', 'budget');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getPendingProposal
// ---------------------------------------------------------------------------

describe('getPendingProposal', () => {
  it('returns null when no pending proposals exist', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    const result = await getPendingProposal('user-agent-1', 'budget');

    expect(result).toBeNull();
  });

  it('returns the pending proposal when one exists', async () => {
    mockSend.mockResolvedValue({ Items: [sampleProposal] });

    const result = await getPendingProposal('user-agent-1', 'budget');

    expect(result).toMatchObject({ status: 'pending', agentType: 'budget' });
  });

  it('filters on both agentType and pending status', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await getPendingProposal('user-agent-1', 'investing');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.FilterExpression).toContain('agentType');
    expect(command.input.FilterExpression).toContain('#status');
    expect(command.input.ExpressionAttributeValues[':agentType']).toBe('investing');
    expect(command.input.ExpressionAttributeValues[':status']).toBe('pending');
    // 'status' is a DynamoDB reserved word — must be aliased
    expect(command.input.ExpressionAttributeNames['#status']).toBe('status');
  });
});

// ---------------------------------------------------------------------------
// getProposalHistory
// ---------------------------------------------------------------------------

describe('getProposalHistory', () => {
  it('returns an empty array when no proposals exist', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    const result = await getProposalHistory('user-agent-1');

    expect(result).toEqual([]);
  });

  it('returns all proposals for the user', async () => {
    const second: Proposal = { ...sampleProposal, proposalId: '02ARZ3NDEKTSV4RRFFQ69G5FAV' };
    mockSend.mockResolvedValue({ Items: [second, sampleProposal] });

    const result = await getProposalHistory('user-agent-1');

    expect(result).toHaveLength(2);
  });

  it('uses ScanIndexForward: false (newest first)', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await getProposalHistory('user-agent-1');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.ScanIndexForward).toBe(false);
  });

  it('does not set Limit', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await getProposalHistory('user-agent-1');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.Limit).toBeUndefined();
  });

  it('returns an empty array when Items is undefined', async () => {
    mockSend.mockResolvedValue({});

    const result = await getProposalHistory('user-agent-1');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getProposalsByType
// ---------------------------------------------------------------------------

describe('getProposalsByType', () => {
  it('returns an empty array when no proposals match the type', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    const result = await getProposalsByType('user-agent-1', 'debt');

    expect(result).toEqual([]);
  });

  it('applies a FilterExpression for agentType', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await getProposalsByType('user-agent-1', 'investing');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.FilterExpression).toContain('agentType');
    expect(command.input.ExpressionAttributeValues[':agentType']).toBe('investing');
  });

  it('uses ScanIndexForward: false', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await getProposalsByType('user-agent-1', 'budget');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.ScanIndexForward).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateProposalStatus
// ---------------------------------------------------------------------------

describe('updateProposalStatus', () => {
  it('calls db.send exactly once', async () => {
    mockSend.mockResolvedValue({});

    await updateProposalStatus('user-agent-1', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'approved', 'pending');

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('targets the Proposals table with the correct key', async () => {
    mockSend.mockResolvedValue({});

    await updateProposalStatus('user-agent-1', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'approved', 'pending');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.TableName).toBe('Proposals');
    expect(command.input.Key).toEqual({
      userId: 'user-agent-1',
      proposalId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    });
  });

  it('uses #status alias because status is a DynamoDB reserved word', async () => {
    mockSend.mockResolvedValue({});

    await updateProposalStatus('user-agent-1', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'rejected', 'pending');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.ExpressionAttributeNames['#status']).toBe('status');
  });

  it('includes a ConditionExpression enforcing the expected current status', async () => {
    mockSend.mockResolvedValue({});

    await updateProposalStatus('user-agent-1', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'approved', 'pending');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.ConditionExpression).toContain('#status = :expectedStatus');
    expect(command.input.ExpressionAttributeValues[':expectedStatus']).toBe('pending');
  });

  it('sets the new status value', async () => {
    mockSend.mockResolvedValue({});

    await updateProposalStatus('user-agent-1', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'executed', 'approved');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.ExpressionAttributeValues[':newStatus']).toBe('executed');
    expect(command.input.ExpressionAttributeValues[':expectedStatus']).toBe('approved');
  });

  it('updates the updatedAt timestamp', async () => {
    mockSend.mockResolvedValue({});

    await updateProposalStatus('user-agent-1', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'approved', 'pending');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.UpdateExpression).toContain('updatedAt');
  });
});
