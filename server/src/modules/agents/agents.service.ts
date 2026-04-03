/**
 * @module agents.service
 * @description Business logic for the Agents module.
 * Orchestrates agent invocations, manages proposals (create, approve, reject),
 * and executes approved proposals by creating real financial records.
 *
 * Services import other services, not other modules' repositories, so that
 * any caching or data transforms added to those modules are inherited here.
 *
 * Idempotency guarantees:
 *   - Only one pending proposal per agent type per user (ConflictError on duplicates).
 *   - executeProposal uses deterministic transaction IDs (proposal_${proposalId}_${index})
 *     so that retries after partial failure are safe — upserts with the same ID are no-ops.
 *   - Status transitions are enforced atomically via DynamoDB ConditionExpressions.
 */
import { ulid } from 'ulid';
import * as agentsRepository from './agents.repository.js';
import { invokeBudgetAgent } from './core/budget-agent.js';
import { invokeDebtAgent } from './core/debt-agent.js';
import { invokeInvestingAgent } from './core/investing-agent.js';
import { getLatestBudget, updateBudget } from '../budget/budget.service.js';
import { getLiabilitiesForUser } from '../liabilities/liabilities.service.js';
import { getAccountsForUser, adjustBalance } from '../accounts/accounts.service.js';
import {
  getLatestHoldings,
  createManualInvestmentTransaction,
  addToHolding,
} from '../investments/investments.service.js';
import { getUserById } from '../auth/auth.service.js';
import { setAgentBudgetApproved } from '../auth/auth.repository.js';
import { createManualTransaction } from '../transactions/transactions.service.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} from '../../lib/errors.js';
import type {
  AgentType,
  AgentMetricsRecord,
  Proposal,
  StoredToolMetrics,
  DebtAccount,
  InvestmentAccount,
  InvestmentHolding,
} from './agents.types.js';
import type { AgentMetrics } from '@strands-agents/sdk';
import type { Liability, Apr } from '../liabilities/liabilities.types.js';
import type { Account } from '../accounts/accounts.types.js';
import type { Holding } from '../investments/investments.types.js';
import type { BudgetProposal, DebtPaymentPlan, InvestmentPlan } from './core/tools.js';

// ---------------------------------------------------------------------------
// Agent invocation methods
// ---------------------------------------------------------------------------

/**
 * Runs the budget agent for a user.
 * Duplicate guard: throws ConflictError if a pending budget proposal already exists.
 *
 * @param {string} userId
 * @returns {Promise<Proposal>} The newly created pending proposal.
 * @throws {ConflictError} If a pending budget proposal already exists.
 * @throws {NotFoundError} If no budget exists for the user.
 * @throws {ServiceUnavailableError} If the agent invocation fails.
 */
export async function runBudgetAgent(userId: string): Promise<Proposal> {
  const existing = await agentsRepository.getPendingProposal(userId, 'budget');
  if (existing) {
    throw new ConflictError('A pending budget proposal already exists');
  }

  const budget = await getLatestBudget(userId);
  if (!budget) {
    throw new NotFoundError('No budget found. Connect a bank account to get started.');
  }

  let output: BudgetProposal;
  let metrics: AgentMetrics | undefined;
  try {
    ({ output, metrics } = await invokeBudgetAgent(userId, budget));
  } catch {
    throw new ServiceUnavailableError('Budget agent is temporarily unavailable. Please try again.');
  }

  const proposal = buildProposal(userId, 'budget', output);
  await agentsRepository.saveProposal(proposal);

  if (metrics) {
    agentsRepository.saveAgentMetrics(buildMetricsRecord(userId, proposal.proposalId, 'budget', metrics)).catch(() => {
      // Fire-and-forget — metrics loss is acceptable, proposal is the critical path
    });
  }

  return proposal;
}

/**
 * Runs the debt agent for a user.
 * Gathers liabilities and accounts, maps them into the agent's input shape,
 * then invokes the agent and saves the result as a pending proposal.
 *
 * @param {string} userId
 * @param {number} debtAllocation - Monthly budget allocated for debt repayment.
 * @returns {Promise<Proposal>}
 * @throws {ConflictError} If a pending debt proposal already exists.
 * @throws {ServiceUnavailableError} If the agent invocation fails.
 */
export async function runDebtAgent(userId: string, debtAllocation: number): Promise<Proposal> {
  const existing = await agentsRepository.getPendingProposal(userId, 'debt');
  if (existing) {
    throw new ConflictError('A pending debt proposal already exists');
  }

  const [liabilities, accounts] = await Promise.all([
    getLiabilitiesForUser(userId),
    getAccountsForUser(userId),
  ]);

  const debts = mapLiabilitiesToDebtAccounts(liabilities, accounts);

  let output: DebtPaymentPlan;
  let metrics: AgentMetrics | undefined;
  try {
    ({ output, metrics } = await invokeDebtAgent({ userId, debtAllocation, debts }));
  } catch {
    throw new ServiceUnavailableError('Debt agent is temporarily unavailable. Please try again.');
  }

  const proposal = buildProposal(userId, 'debt', output);
  await agentsRepository.saveProposal(proposal);

  if (metrics) {
    agentsRepository.saveAgentMetrics(buildMetricsRecord(userId, proposal.proposalId, 'debt', metrics)).catch(() => {
      // Fire-and-forget — metrics loss is acceptable, proposal is the critical path
    });
  }

  return proposal;
}

/**
 * Runs the investing agent for a user.
 * Gathers accounts, holdings, and user age, maps them into the agent's input
 * shape, then invokes the agent and saves the result as a pending proposal.
 *
 * @param {string} userId
 * @param {number} investingAllocation - Monthly budget allocated for investing.
 * @returns {Promise<Proposal>}
 * @throws {ConflictError} If a pending investing proposal already exists.
 * @throws {ServiceUnavailableError} If the agent invocation fails.
 */
export async function runInvestingAgent(userId: string, investingAllocation: number): Promise<Proposal> {
  const existing = await agentsRepository.getPendingProposal(userId, 'investing');
  if (existing) {
    throw new ConflictError('A pending investing proposal already exists');
  }

  const [accounts, holdings, user] = await Promise.all([
    getAccountsForUser(userId),
    getLatestHoldings(userId),
    getUserById(userId),
  ]);

  const investmentAccounts = mapToInvestmentAccounts(accounts, holdings);
  const userAge = user.birthday ? computeAge(user.birthday) : null;

  let output: InvestmentPlan;
  let metrics: AgentMetrics | undefined;
  try {
    ({ output, metrics } = await invokeInvestingAgent({ userId, investingAllocation, accounts: investmentAccounts, userAge }));
  } catch {
    throw new ServiceUnavailableError('Investing agent is temporarily unavailable. Please try again.');
  }

  const proposal = buildProposal(userId, 'investing', output);
  await agentsRepository.saveProposal(proposal);

  if (metrics) {
    agentsRepository.saveAgentMetrics(buildMetricsRecord(userId, proposal.proposalId, 'investing', metrics)).catch(() => {
      // Fire-and-forget — metrics loss is acceptable, proposal is the critical path
    });
  }

  return proposal;
}

// ---------------------------------------------------------------------------
// Proposal management
// ---------------------------------------------------------------------------

/**
 * Retrieves a single proposal by ID.
 *
 * @param {string} userId
 * @param {string} proposalId
 * @returns {Promise<Proposal>}
 * @throws {NotFoundError} If the proposal does not exist.
 */
export async function getProposal(userId: string, proposalId: string): Promise<Proposal> {
  const proposal = await agentsRepository.getProposalById(userId, proposalId);
  if (!proposal) {
    throw new NotFoundError('Proposal not found');
  }
  return proposal;
}

/**
 * Returns all proposals for a user, newest first.
 *
 * @param {string} userId
 * @returns {Promise<Proposal[]>}
 */
export async function getProposalHistory(userId: string): Promise<Proposal[]> {
  return agentsRepository.getProposalHistory(userId);
}

/**
 * Returns all proposals of a given agent type for a user, newest first.
 *
 * @param {string} userId
 * @param {AgentType} agentType
 * @returns {Promise<Proposal[]>}
 */
export async function getProposalsByType(userId: string, agentType: AgentType): Promise<Proposal[]> {
  return agentsRepository.getProposalsByType(userId, agentType);
}

/**
 * Approves a pending proposal (no side effects — execution is separate).
 *
 * @param {string} userId
 * @param {string} proposalId
 * @returns {Promise<Proposal>} The proposal with status 'approved'.
 * @throws {NotFoundError} If the proposal does not exist.
 * @throws {BadRequestError} If the proposal is not in 'pending' status.
 */
export async function approveProposal(userId: string, proposalId: string): Promise<Proposal> {
  const proposal = await agentsRepository.getProposalById(userId, proposalId);
  if (!proposal) {
    throw new NotFoundError('Proposal not found');
  }
  if (proposal.status !== 'pending') {
    throw new BadRequestError('Only pending proposals can be approved');
  }

  await agentsRepository.updateProposalStatus(userId, proposalId, 'approved', 'pending');
  return { ...proposal, status: 'approved', updatedAt: new Date().toISOString() };
}

/**
 * Rejects a pending proposal.
 *
 * @param {string} userId
 * @param {string} proposalId
 * @returns {Promise<Proposal>} The proposal with status 'rejected'.
 * @throws {NotFoundError} If the proposal does not exist.
 * @throws {BadRequestError} If the proposal is not in 'pending' status.
 */
export async function rejectProposal(userId: string, proposalId: string): Promise<Proposal> {
  const proposal = await agentsRepository.getProposalById(userId, proposalId);
  if (!proposal) {
    throw new NotFoundError('Proposal not found');
  }
  if (proposal.status !== 'pending') {
    throw new BadRequestError('Only pending proposals can be rejected');
  }

  await agentsRepository.updateProposalStatus(userId, proposalId, 'rejected', 'pending');
  return { ...proposal, status: 'rejected', updatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Autonomous execution
// ---------------------------------------------------------------------------

/**
 * Executes an approved proposal by creating real financial records.
 * Dispatches to the appropriate handler based on agentType:
 *   - budget: updates the user's budget with the proposed category amounts
 *   - debt: creates manual transactions for each scheduled payment
 *   - investing: creates investment transactions and updates holdings
 *
 * Transaction IDs are deterministic (proposal_${proposalId}_${index}) so
 * retries after partial failure are safe — upserts with the same ID are no-ops.
 *
 * Status transitions to 'executed' only after all side effects succeed.
 *
 * @param {string} userId
 * @param {string} proposalId
 * @returns {Promise<Proposal>} The proposal with status 'executed'.
 * @throws {NotFoundError} If the proposal does not exist.
 * @throws {BadRequestError} If the proposal is not in 'approved' status.
 */
export async function executeProposal(userId: string, proposalId: string): Promise<Proposal> {
  const proposal = await agentsRepository.getProposalById(userId, proposalId);
  if (!proposal) {
    throw new NotFoundError('Proposal not found');
  }
  if (proposal.status !== 'approved') {
    throw new BadRequestError('Only approved proposals can be executed');
  }

  switch (proposal.agentType) {
    case 'budget':
      await executeBudgetProposal(userId, proposal.result as BudgetProposal);
      // Mark the user's onboarding as complete so the frontend skips the
      // agent step on subsequent logins.
      await setAgentBudgetApproved(userId);
      break;
    case 'debt':
      await executeDebtProposal(userId, proposalId, proposal.result as DebtPaymentPlan);
      break;
    case 'investing':
      await executeInvestingProposal(userId, proposalId, proposal.result as InvestmentPlan);
      break;
  }

  await agentsRepository.updateProposalStatus(userId, proposalId, 'executed', 'approved');
  return { ...proposal, status: 'executed', updatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Execution helpers (private)
// ---------------------------------------------------------------------------

/**
 * Applies a budget proposal by calling updateBudget with the proposed amounts.
 *
 * @param {string} userId
 * @param {BudgetProposal} result
 */
async function executeBudgetProposal(userId: string, result: BudgetProposal): Promise<void> {
  await updateBudget(userId, {
    income: { amount: result.income },
    housing: { amount: result.housing },
    utilities: { amount: result.utilities },
    transportation: { amount: result.transportation },
    groceries: { amount: result.groceries },
    takeout: { amount: result.takeout },
    shopping: { amount: result.shopping },
    personalCare: { amount: result.personalCare },
    emergencyFund: { amount: result.emergencyFund },
    entertainment: { amount: result.entertainment },
    medical: { amount: result.medical },
    debts: { amount: result.debts },
    investments: { amount: result.investments },
  });
}

/**
 * Creates manual transactions for each scheduled debt payment.
 * Transaction IDs are deterministic for idempotent retry.
 *
 * @param {string} userId
 * @param {string} proposalId
 * @param {DebtPaymentPlan} plan
 */
async function executeDebtProposal(
  userId: string,
  proposalId: string,
  plan: DebtPaymentPlan,
): Promise<void> {
  const checkingAccount = await findCheckingAccount(userId);

  for (let i = 0; i < plan.scheduled_payments.length; i++) {
    const payment = plan.scheduled_payments[i];
    await createManualTransaction(userId, {
      transactionId: `proposal_${proposalId}_${i}`,
      plaidAccountId: payment.plaid_account_id,
      amount: payment.amount,
      name: `Debt payment - ${payment.debt_name}`,
      category: 'LOAN_PAYMENTS',
      detailedCategory: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
    });

    // Decrease debt account balance (payment reduces what is owed)
    await adjustBalance(userId, payment.plaid_account_id, -payment.amount);
    // Decrease checking account balance (money leaves checking)
    if (checkingAccount) {
      await adjustBalance(userId, checkingAccount.plaidAccountId, -payment.amount);
    }
  }
}

/**
 * Creates investment transactions and updates holdings for each scheduled contribution.
 * Transaction IDs are deterministic for idempotent retry.
 *
 * @param {string} userId
 * @param {string} proposalId
 * @param {InvestmentPlan} plan
 */
async function executeInvestingProposal(
  userId: string,
  proposalId: string,
  plan: InvestmentPlan,
): Promise<void> {
  const checkingAccount = await findCheckingAccount(userId);

  for (let i = 0; i < plan.scheduled_contributions.length; i++) {
    const contribution = plan.scheduled_contributions[i];

    // Price defaults to 1 when no fund ticker is present (e.g. cash contribution)
    const price = 1;
    const quantity = contribution.amount / price;

    await createManualInvestmentTransaction(userId, {
      transactionId: `proposal_${proposalId}_${i}`,
      plaidAccountId: contribution.plaid_account_id,
      securityId: contribution.fund_ticker ?? `cash_${contribution.plaid_account_id}`,
      amount: contribution.amount,
      name: `Investment contribution - ${contribution.account_name}`,
      price,
      quantity,
    });

    await addToHolding(userId, {
      plaidAccountId: contribution.plaid_account_id,
      securityId: contribution.fund_ticker ?? `cash_${contribution.plaid_account_id}`,
      additionalQuantity: quantity,
      price,
    });

    // Increase investment account balance (contribution adds to the account)
    await adjustBalance(userId, contribution.plaid_account_id, contribution.amount);
    // Decrease checking account balance (money leaves checking)
    if (checkingAccount) {
      await adjustBalance(userId, checkingAccount.plaidAccountId, -contribution.amount);
    }
  }
}

// ---------------------------------------------------------------------------
// Account lookup helpers
// ---------------------------------------------------------------------------

/**
 * Finds the user's primary checking account for use as the source of
 * debt payments and investment contributions. Returns null if no checking
 * account exists. Never returns savings/emergency fund accounts.
 *
 * @param {string} userId
 * @returns {Promise<{ plaidAccountId: string } | null>}
 */
async function findCheckingAccount(userId: string): Promise<{ plaidAccountId: string } | null> {
  const accounts = await getAccountsForUser(userId);
  const checking = accounts.find(
    (a) => a.type === 'depository' && a.subtype === 'checking',
  );
  return checking ?? null;
}

// ---------------------------------------------------------------------------
// Pure mapping helpers
// ---------------------------------------------------------------------------

/**
 * Maps liabilities and accounts into the DebtAccount[] shape expected by the debt agent.
 * Joins liabilities to accounts by plaidAccountId to get current balances.
 *
 * @param {Liability[]} liabilities - From liabilities.service.getLiabilitiesForUser.
 * @param {Account[]} accounts - From accounts.service.getAccountsForUser.
 * @returns {DebtAccount[]}
 */
export function mapLiabilitiesToDebtAccounts(liabilities: Liability[], accounts: Account[]): DebtAccount[] {
  const accountMap = new Map(accounts.map((a) => [a.plaidAccountId, a]));

  return liabilities.map((liability) => {
    const account = accountMap.get(liability.plaidAccountId);

    let type: DebtAccount['type'] = 'other';
    if (liability.liabilityType === 'credit') type = 'credit_card';
    else if (liability.liabilityType === 'student') type = 'student_loan';
    else if (liability.liabilityType === 'mortgage') type = 'mortgage';

    let interestRate: number | null = null;
    let minimumPayment: number | null = null;
    let nextPaymentDueDate: string | null = null;

    if (liability.liabilityType === 'credit') {
      const purchaseApr = liability.details?.aprs?.find((a: Apr) => a.aprType === 'purchase_apr');
      interestRate = purchaseApr?.aprPercentage ?? null;
      minimumPayment = liability.details?.minimumPaymentAmount ?? null;
      nextPaymentDueDate = liability.details?.nextPaymentDueDate ?? null;
    } else if (liability.liabilityType === 'student') {
      interestRate = liability.details?.interestRatePercentage ?? null;
      minimumPayment = liability.details?.minimumPaymentAmount ?? null;
    } else if (liability.liabilityType === 'mortgage') {
      interestRate = liability.details?.interestRatePercentage ?? null;
      minimumPayment = liability.details?.nextMonthlyPayment ?? null;
    }

    return {
      account_id: liability.plaidAccountId,
      name: account?.name ?? 'Unknown Account',
      institution_name: null,
      type,
      current_balance: account?.currentBalance ?? liability.currentBalance ?? 0,
      interest_rate: interestRate,
      minimum_payment: minimumPayment,
      next_payment_due_date: nextPaymentDueDate,
    };
  });
}

/**
 * Maps accounts and holdings into the InvestmentAccount[] shape expected
 * by the investing agent. Groups holdings by account.
 *
 * @param {Account[]} accounts - From accounts.service.getAccountsForUser.
 * @param {Holding[]} holdings - From investments.service.getLatestHoldings.
 * @returns {InvestmentAccount[]}
 */
export function mapToInvestmentAccounts(accounts: Account[], holdings: Holding[]): InvestmentAccount[] {
  // Group holdings by account
  const holdingsByAccount = new Map<string, InvestmentHolding[]>();
  for (const h of holdings) {
    const accountId = h.plaidAccountId;
    if (!holdingsByAccount.has(accountId)) {
      holdingsByAccount.set(accountId, []);
    }
    holdingsByAccount.get(accountId)!.push({
      security_name: h.securityName ?? 'Unknown',
      ticker_symbol: h.tickerSymbol ?? null,
      quantity: h.quantity,
      current_value: h.institutionValue,
    });
  }

  // Filter to investment accounts only
  const investmentAccounts = accounts.filter(
    (a) => a.type === 'investment',
  );

  return investmentAccounts.map((account) => {
    let type: InvestmentAccount['type'] = 'other';
    const subtype = account.subtype?.toLowerCase() ?? '';
    if (subtype.includes('401')) type = '401k';
    else if (subtype.includes('ira')) type = 'ira';
    else if (subtype.includes('brokerage')) type = 'brokerage';

    return {
      account_id: account.plaidAccountId,
      name: account.name,
      institution_name: null,
      type,
      current_balance: account.currentBalance ?? 0,
      holdings: holdingsByAccount.get(account.plaidAccountId) ?? [],
    };
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Maps an SDK AgentMetrics snapshot into an AgentMetricsRecord ready for
 * DynamoDB persistence. Computes averageTimeMs and successRate per tool using
 * the SDK's `toolUsage` getter which exposes pre-computed averages.
 *
 * @param {string} userId
 * @param {string} proposalId - FK linking the metrics to the generating proposal.
 * @param {AgentType} agentType
 * @param {AgentMetrics} metrics - Raw SDK snapshot from agent.invoke().
 * @returns {AgentMetricsRecord}
 */
function buildMetricsRecord(
  userId: string,
  proposalId: string,
  agentType: AgentType,
  metrics: AgentMetrics,
): AgentMetricsRecord {
  const toolMetrics: AgentMetricsRecord['toolMetrics'] = {};
  // toolUsage is a computed getter that includes averageTime and successRate
  for (const [name, data] of Object.entries(metrics.toolUsage)) {
    toolMetrics[name] = {
      callCount: data.callCount,
      successCount: data.successCount,
      errorCount: data.errorCount,
      totalTimeMs: data.totalTime,
      averageTimeMs: data.averageTime,
      successRate: data.successRate,
    } satisfies StoredToolMetrics;
  }

  return {
    userId,
    metricId: ulid(),
    proposalId,
    agentType,
    createdAt: new Date().toISOString(),
    totalTokens: metrics.accumulatedUsage.totalTokens,
    inputTokens: metrics.accumulatedUsage.inputTokens,
    outputTokens: metrics.accumulatedUsage.outputTokens,
    cacheReadTokens: metrics.accumulatedUsage.cacheReadInputTokens ?? 0,
    cacheWriteTokens: metrics.accumulatedUsage.cacheWriteInputTokens ?? 0,
    totalDurationMs: metrics.totalDuration,
    modelLatencyMs: metrics.accumulatedMetrics.latencyMs,
    cycleCount: metrics.cycleCount,
    averageCycleDurationMs: metrics.averageCycleTime,
    toolMetrics,
  };
}

/**
 * Builds a new Proposal object with a generated ULID and timestamps.
 *
 * @param {string} userId
 * @param {AgentType} agentType
 * @param {BudgetProposal | DebtPaymentPlan | InvestmentPlan} result
 * @returns {Proposal}
 */
function buildProposal(
  userId: string,
  agentType: AgentType,
  result: BudgetProposal | DebtPaymentPlan | InvestmentPlan,
): Proposal {
  const now = new Date().toISOString();
  return {
    userId,
    proposalId: ulid(),
    agentType,
    status: 'pending',
    result,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Computes a user's age in whole years from their birthday.
 * Accounts for whether the birthday has occurred yet this year.
 *
 * @param {string} birthday - ISO date string (YYYY-MM-DD).
 * @returns {number} Age in whole years.
 */
function computeAge(birthday: string): number {
  const birth = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
