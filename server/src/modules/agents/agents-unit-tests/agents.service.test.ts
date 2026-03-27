/**
 * @module agents.service.test
 * @description Unit tests for agents.service — business logic for agent invocation,
 * proposal management, and autonomous execution. All dependencies (repository,
 * other services, agent invocation functions) are fully mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictError, NotFoundError, BadRequestError, ServiceUnavailableError } from '../../../lib/errors.js';
import type { Budget } from '../../budget/budget.types.js';
import type { PublicUser } from '../../auth/auth.service.js';
import type { Transaction } from '../../transactions/transactions.types.js';
import type { InvestmentTransaction } from '../../investments/investments.types.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../agents.repository.js', () => ({
  saveProposal: vi.fn(),
  getProposalById: vi.fn(),
  getLatestProposal: vi.fn(),
  getPendingProposal: vi.fn(),
  getProposalHistory: vi.fn(),
  getProposalsByType: vi.fn(),
  updateProposalStatus: vi.fn(),
}));

vi.mock('../../budget/budget.service.js', () => ({
  getLatestBudget: vi.fn(),
  updateBudget: vi.fn(),
}));

vi.mock('../../liabilities/liabilities.service.js', () => ({
  getLiabilitiesForUser: vi.fn(),
}));

vi.mock('../../accounts/accounts.service.js', () => ({
  getAccountsForUser: vi.fn(),
  adjustBalance: vi.fn(),
}));

vi.mock('../../investments/investments.service.js', () => ({
  getLatestHoldings: vi.fn(),
  createManualInvestmentTransaction: vi.fn(),
  addToHolding: vi.fn(),
}));

vi.mock('../../auth/auth.service.js', () => ({
  getUserById: vi.fn(),
}));

vi.mock('../../auth/auth.repository.js', () => ({
  setAgentBudgetApproved: vi.fn(),
}));

vi.mock('../../transactions/transactions.service.js', () => ({
  createManualTransaction: vi.fn(),
}));

const { mockInvokeBudgetAgent } = vi.hoisted(() => ({
  mockInvokeBudgetAgent: vi.fn(),
}));
vi.mock('../budget-agent.js', () => ({
  invokeBudgetAgent: mockInvokeBudgetAgent,
}));

const { mockInvokeDebtAgent } = vi.hoisted(() => ({
  mockInvokeDebtAgent: vi.fn(),
}));
vi.mock('../debt-agent.js', () => ({
  invokeDebtAgent: mockInvokeDebtAgent,
}));

const { mockInvokeInvestingAgent } = vi.hoisted(() => ({
  mockInvokeInvestingAgent: vi.fn(),
}));
vi.mock('../investing-agent.js', () => ({
  invokeInvestingAgent: mockInvokeInvestingAgent,
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
  getProposalsByType,
  approveProposal,
  rejectProposal,
  executeProposal,
} from '../agents.service.js';
import * as agentsRepo from '../agents.repository.js';
import * as budgetService from '../../budget/budget.service.js';
import * as liabilitiesService from '../../liabilities/liabilities.service.js';
import * as accountsService from '../../accounts/accounts.service.js';
import * as investmentsService from '../../investments/investments.service.js';
import * as authService from '../../auth/auth.service.js';
import * as txService from '../../transactions/transactions.service.js';
import type { Proposal } from '../agents.types.js';
import type { BudgetProposal, DebtPaymentPlan, InvestmentPlan } from '../tools.js';

const mockSaveProposal = vi.mocked(agentsRepo.saveProposal);
const mockGetProposalById = vi.mocked(agentsRepo.getProposalById);
const mockGetPendingProposal = vi.mocked(agentsRepo.getPendingProposal);
const mockGetProposalHistory = vi.mocked(agentsRepo.getProposalHistory);
const mockGetProposalsByType = vi.mocked(agentsRepo.getProposalsByType);
const mockUpdateProposalStatus = vi.mocked(agentsRepo.updateProposalStatus);
const mockGetLatestBudget = vi.mocked(budgetService.getLatestBudget);
const mockUpdateBudget = vi.mocked(budgetService.updateBudget);
const mockGetLiabilitiesForUser = vi.mocked(liabilitiesService.getLiabilitiesForUser);
const mockGetAccountsForUser = vi.mocked(accountsService.getAccountsForUser);
const mockGetLatestHoldings = vi.mocked(investmentsService.getLatestHoldings);
const mockCreateManualInvestmentTransaction = vi.mocked(investmentsService.createManualInvestmentTransaction);
const mockAddToHolding = vi.mocked(investmentsService.addToHolding);
const mockGetUserById = vi.mocked(authService.getUserById);
const mockCreateManualTransaction = vi.mocked(txService.createManualTransaction);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleBudgetProposal: BudgetProposal = {
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
};

const sampleDebtPlan: DebtPaymentPlan = {
  summary: 'Pay off credit card first',
  rationale: 'Avalanche strategy',
  scheduled_payments: [
    { plaid_account_id: 'acct-1', debt_name: 'Chase Visa', amount: 200, payment_type: 'minimum' },
    { plaid_account_id: 'acct-2', debt_name: 'Student Loan', amount: 300, payment_type: 'extra' },
  ],
  projections: [
    { plaid_account_id: 'acct-1', debt_name: 'Chase Visa', current_balance: 5000, apr: 0.24, months_to_payoff: 30, total_interest_paid: 1200 },
  ],
  interest_savings: 500,
  positive_outcomes: 'Save $500 in interest',
};

const sampleInvestmentPlan: InvestmentPlan = {
  summary: 'Max 401k match first',
  rationale: 'Priority order',
  scheduled_contributions: [
    { plaid_account_id: 'acct-inv-1', account_name: 'Fidelity 401k', amount: 500, contribution_type: '401k', fund_ticker: 'FXAIX', fund_name: 'Fidelity 500 Index' },
  ],
  projections: {
    retirement_age: 60,
    years_to_retirement: 30,
    assumed_annual_return: 0.07,
    total_projected_contributions: 180000,
    total_projected_growth: 400000,
    total_at_retirement: 580000,
    holdings: [
      { fund_ticker: 'FXAIX', fund_name: 'Fidelity 500 Index', current_value: 10000, projected_value_at_retirement: 200000 },
    ],
  },
  positive_outcome: 'On track for $580k by 60',
};

const samplePendingProposal: Proposal = {
  userId: 'user-1',
  proposalId: '01ABC',
  agentType: 'budget',
  status: 'pending',
  result: sampleBudgetProposal,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const sampleApprovedProposal: Proposal = {
  ...samplePendingProposal,
  status: 'approved',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// runBudgetAgent
// ---------------------------------------------------------------------------

describe('runBudgetAgent', () => {
  it('throws ConflictError when a pending budget proposal already exists', async () => {
    mockGetPendingProposal.mockResolvedValue(samplePendingProposal);

    await expect(runBudgetAgent('user-1')).rejects.toThrow(ConflictError);
  });

  it('throws NotFoundError when no budget exists for the user', async () => {
    mockGetPendingProposal.mockResolvedValue(null);
    mockGetLatestBudget.mockResolvedValue(null);

    await expect(runBudgetAgent('user-1')).rejects.toThrow(NotFoundError);
  });

  it('saves the proposal with status pending', async () => {
    mockGetPendingProposal.mockResolvedValue(null);
    mockGetLatestBudget.mockResolvedValue({ userId: 'user-1' } as unknown as Budget);
    mockInvokeBudgetAgent.mockResolvedValue(sampleBudgetProposal);
    mockSaveProposal.mockResolvedValue(undefined);

    const result = await runBudgetAgent('user-1');

    expect(result.status).toBe('pending');
    expect(result.agentType).toBe('budget');
    expect(mockSaveProposal).toHaveBeenCalledTimes(1);
  });

  it('wraps agent invocation errors in ServiceUnavailableError', async () => {
    mockGetPendingProposal.mockResolvedValue(null);
    mockGetLatestBudget.mockResolvedValue({ userId: 'user-1' } as unknown as Budget);
    mockInvokeBudgetAgent.mockRejectedValue(new Error('LLM timeout'));

    await expect(runBudgetAgent('user-1')).rejects.toThrow(ServiceUnavailableError);
  });
});

// ---------------------------------------------------------------------------
// runDebtAgent
// ---------------------------------------------------------------------------

describe('runDebtAgent', () => {
  it('throws ConflictError when a pending debt proposal already exists', async () => {
    mockGetPendingProposal.mockResolvedValue({ ...samplePendingProposal, agentType: 'debt' });

    await expect(runDebtAgent('user-1', 500)).rejects.toThrow(ConflictError);
  });

  it('gathers liabilities and accounts, invokes agent, and saves proposal', async () => {
    mockGetPendingProposal.mockResolvedValue(null);
    mockGetLiabilitiesForUser.mockResolvedValue([]);
    mockGetAccountsForUser.mockResolvedValue([]);
    mockInvokeDebtAgent.mockResolvedValue(sampleDebtPlan);
    mockSaveProposal.mockResolvedValue(undefined);

    const result = await runDebtAgent('user-1', 500);

    expect(result.agentType).toBe('debt');
    expect(result.status).toBe('pending');
    expect(mockSaveProposal).toHaveBeenCalledTimes(1);
  });

  it('wraps agent invocation errors in ServiceUnavailableError', async () => {
    mockGetPendingProposal.mockResolvedValue(null);
    mockGetLiabilitiesForUser.mockResolvedValue([]);
    mockGetAccountsForUser.mockResolvedValue([]);
    mockInvokeDebtAgent.mockRejectedValue(new Error('Agent crashed'));

    await expect(runDebtAgent('user-1', 500)).rejects.toThrow(ServiceUnavailableError);
  });
});

// ---------------------------------------------------------------------------
// runInvestingAgent
// ---------------------------------------------------------------------------

describe('runInvestingAgent', () => {
  it('throws ConflictError when a pending investing proposal already exists', async () => {
    mockGetPendingProposal.mockResolvedValue({ ...samplePendingProposal, agentType: 'investing' });

    await expect(runInvestingAgent('user-1', 500)).rejects.toThrow(ConflictError);
  });

  it('gathers accounts, holdings, and user age, invokes agent, and saves proposal', async () => {
    mockGetPendingProposal.mockResolvedValue(null);
    mockGetAccountsForUser.mockResolvedValue([]);
    mockGetLatestHoldings.mockResolvedValue([]);
    mockGetUserById.mockResolvedValue({ userId: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@test.com', createdAt: '2024-01-01' } as unknown as PublicUser);
    mockInvokeInvestingAgent.mockResolvedValue(sampleInvestmentPlan);
    mockSaveProposal.mockResolvedValue(undefined);

    const result = await runInvestingAgent('user-1', 500);

    expect(result.agentType).toBe('investing');
    expect(result.status).toBe('pending');
  });

  it('wraps agent invocation errors in ServiceUnavailableError', async () => {
    mockGetPendingProposal.mockResolvedValue(null);
    mockGetAccountsForUser.mockResolvedValue([]);
    mockGetLatestHoldings.mockResolvedValue([]);
    mockGetUserById.mockResolvedValue({ userId: 'user-1' } as unknown as PublicUser);
    mockInvokeInvestingAgent.mockRejectedValue(new Error('Timeout'));

    await expect(runInvestingAgent('user-1', 500)).rejects.toThrow(ServiceUnavailableError);
  });
});

// ---------------------------------------------------------------------------
// getProposal
// ---------------------------------------------------------------------------

describe('getProposal', () => {
  it('returns the proposal when found', async () => {
    mockGetProposalById.mockResolvedValue(samplePendingProposal);

    const result = await getProposal('user-1', '01ABC');

    expect(result).toMatchObject({ proposalId: '01ABC' });
  });

  it('throws NotFoundError when not found', async () => {
    mockGetProposalById.mockResolvedValue(null);

    await expect(getProposal('user-1', 'nonexistent')).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// getProposalHistory
// ---------------------------------------------------------------------------

describe('getProposalHistory', () => {
  it('delegates to repository', async () => {
    mockGetProposalHistory.mockResolvedValue([samplePendingProposal]);

    const result = await getProposalHistory('user-1');

    expect(result).toHaveLength(1);
    expect(mockGetProposalHistory).toHaveBeenCalledWith('user-1');
  });
});

// ---------------------------------------------------------------------------
// getProposalsByType
// ---------------------------------------------------------------------------

describe('getProposalsByType', () => {
  it('delegates to repository with the agent type', async () => {
    mockGetProposalsByType.mockResolvedValue([]);

    await getProposalsByType('user-1', 'debt');

    expect(mockGetProposalsByType).toHaveBeenCalledWith('user-1', 'debt');
  });
});

// ---------------------------------------------------------------------------
// approveProposal
// ---------------------------------------------------------------------------

describe('approveProposal', () => {
  it('throws NotFoundError when proposal does not exist', async () => {
    mockGetProposalById.mockResolvedValue(null);

    await expect(approveProposal('user-1', 'nonexistent')).rejects.toThrow(NotFoundError);
  });

  it('throws BadRequestError when proposal is not pending', async () => {
    mockGetProposalById.mockResolvedValue(sampleApprovedProposal);

    await expect(approveProposal('user-1', '01ABC')).rejects.toThrow(BadRequestError);
  });

  it('updates status to approved for a pending proposal', async () => {
    mockGetProposalById.mockResolvedValue(samplePendingProposal);
    mockUpdateProposalStatus.mockResolvedValue(undefined);

    const result = await approveProposal('user-1', '01ABC');

    expect(mockUpdateProposalStatus).toHaveBeenCalledWith('user-1', '01ABC', 'approved', 'pending');
    expect(result.status).toBe('approved');
  });
});

// ---------------------------------------------------------------------------
// rejectProposal
// ---------------------------------------------------------------------------

describe('rejectProposal', () => {
  it('throws NotFoundError when proposal does not exist', async () => {
    mockGetProposalById.mockResolvedValue(null);

    await expect(rejectProposal('user-1', 'nonexistent')).rejects.toThrow(NotFoundError);
  });

  it('throws BadRequestError when proposal is not pending', async () => {
    mockGetProposalById.mockResolvedValue({ ...samplePendingProposal, status: 'rejected' });

    await expect(rejectProposal('user-1', '01ABC')).rejects.toThrow(BadRequestError);
  });

  it('updates status to rejected for a pending proposal', async () => {
    mockGetProposalById.mockResolvedValue(samplePendingProposal);
    mockUpdateProposalStatus.mockResolvedValue(undefined);

    const result = await rejectProposal('user-1', '01ABC');

    expect(mockUpdateProposalStatus).toHaveBeenCalledWith('user-1', '01ABC', 'rejected', 'pending');
    expect(result.status).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------
// executeProposal
// ---------------------------------------------------------------------------

describe('executeProposal', () => {
  it('throws NotFoundError when proposal does not exist', async () => {
    mockGetProposalById.mockResolvedValue(null);

    await expect(executeProposal('user-1', 'nonexistent')).rejects.toThrow(NotFoundError);
  });

  it('throws BadRequestError when proposal is not approved', async () => {
    mockGetProposalById.mockResolvedValue(samplePendingProposal);

    await expect(executeProposal('user-1', '01ABC')).rejects.toThrow(BadRequestError);
  });

  it('throws BadRequestError when proposal is already executed', async () => {
    mockGetProposalById.mockResolvedValue({ ...samplePendingProposal, status: 'executed' });

    await expect(executeProposal('user-1', '01ABC')).rejects.toThrow(BadRequestError);
  });

  it('calls updateBudget for a budget proposal', async () => {
    const budgetProposal: Proposal = {
      ...sampleApprovedProposal,
      agentType: 'budget',
      result: sampleBudgetProposal,
    };
    mockGetProposalById.mockResolvedValue(budgetProposal);
    mockUpdateBudget.mockResolvedValue({} as unknown as Budget);
    mockUpdateProposalStatus.mockResolvedValue(undefined);

    await executeProposal('user-1', '01ABC');

    expect(mockUpdateBudget).toHaveBeenCalledTimes(1);
    expect(mockUpdateProposalStatus).toHaveBeenCalledWith('user-1', '01ABC', 'executed', 'approved');
  });

  it('creates manual transactions for each debt scheduled payment', async () => {
    const debtProposal: Proposal = {
      ...sampleApprovedProposal,
      agentType: 'debt',
      result: sampleDebtPlan,
    };
    mockGetProposalById.mockResolvedValue(debtProposal);
    mockCreateManualTransaction.mockResolvedValue({} as unknown as Transaction);
    mockUpdateProposalStatus.mockResolvedValue(undefined);

    await executeProposal('user-1', '01ABC');

    // sampleDebtPlan has 2 scheduled_payments
    expect(mockCreateManualTransaction).toHaveBeenCalledTimes(2);
    expect(mockUpdateProposalStatus).toHaveBeenCalledWith('user-1', '01ABC', 'executed', 'approved');
  });

  it('uses deterministic transaction IDs for debt payments', async () => {
    const debtProposal: Proposal = {
      ...sampleApprovedProposal,
      agentType: 'debt',
      result: sampleDebtPlan,
    };
    mockGetProposalById.mockResolvedValue(debtProposal);
    mockCreateManualTransaction.mockResolvedValue({} as unknown as Transaction);
    mockUpdateProposalStatus.mockResolvedValue(undefined);

    await executeProposal('user-1', '01ABC');

    const firstCall = mockCreateManualTransaction.mock.calls[0];
    const secondCall = mockCreateManualTransaction.mock.calls[1];
    expect(firstCall[1].transactionId).toBe('proposal_01ABC_0');
    expect(secondCall[1].transactionId).toBe('proposal_01ABC_1');
  });

  it('creates investment transactions and updates holdings for investing proposal', async () => {
    const investingProposal: Proposal = {
      ...sampleApprovedProposal,
      agentType: 'investing',
      result: sampleInvestmentPlan,
    };
    mockGetProposalById.mockResolvedValue(investingProposal);
    mockCreateManualInvestmentTransaction.mockResolvedValue({} as unknown as InvestmentTransaction);
    mockAddToHolding.mockResolvedValue(undefined);
    mockUpdateProposalStatus.mockResolvedValue(undefined);

    await executeProposal('user-1', '01ABC');

    // sampleInvestmentPlan has 1 scheduled_contribution
    expect(mockCreateManualInvestmentTransaction).toHaveBeenCalledTimes(1);
    expect(mockAddToHolding).toHaveBeenCalledTimes(1);
    expect(mockUpdateProposalStatus).toHaveBeenCalledWith('user-1', '01ABC', 'executed', 'approved');
  });

  it('uses deterministic transaction IDs for investment contributions', async () => {
    const investingProposal: Proposal = {
      ...sampleApprovedProposal,
      agentType: 'investing',
      result: sampleInvestmentPlan,
    };
    mockGetProposalById.mockResolvedValue(investingProposal);
    mockCreateManualInvestmentTransaction.mockResolvedValue({} as unknown as InvestmentTransaction);
    mockAddToHolding.mockResolvedValue(undefined);
    mockUpdateProposalStatus.mockResolvedValue(undefined);

    await executeProposal('user-1', '01ABC');

    const call = mockCreateManualInvestmentTransaction.mock.calls[0];
    expect(call[1].transactionId).toBe('proposal_01ABC_0');
  });
});
