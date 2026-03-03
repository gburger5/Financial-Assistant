/**
 * @module budget.service
 * @description Business logic for the Budget module.
 * Coordinates between the budget repository, transactions service,
 * liabilities service, and analysis functions to create and manage budgets.
 *
 * Services import other services, not other modules' repositories, so that
 * any caching or data transforms added to those modules are inherited here.
 */
import { ulid } from 'ulid';
import * as budgetRepository from './budget.repository.js';
import { generateBudgetFromHistory } from './budget.analysis.js';
import { getTransactionsSince } from '../transactions/transactions.service.js';
import { getTransactionsSince as getInvestmentTransactionsSince } from '../investments/investments.service.js';
import { getLiabilitiesForUser } from '../liabilities/liabilities.service.js';
import { NotFoundError } from '../../lib/errors.js';
import type { Budget, BudgetUpdateInput } from './budget.types.js';

/**
 * Creates the initial budget for a user from their full financial history.
 * Guard: if a budget already exists, returns it unchanged. This handles the
 * case where a user links a second bank account and triggerInitialSync fires
 * again — their existing budget (which may have user edits) is preserved.
 *
 * Fetches transactions since 2000-01-01 (effectively all-time) and all
 * liabilities, then delegates computation to generateBudgetFromHistory.
 *
 * @param {string} userId
 * @returns {Promise<Budget>} The existing or newly generated budget.
 */
export async function createInitialBudget(userId: string): Promise<Budget> {
  const existing = await budgetRepository.getLatestBudget(userId);

  if (existing) {
    // Budget already exists — user is linking a second bank.
    // Don't overwrite their existing budget (which may have user edits).
    return existing;
  }

  const [transactions, investmentTransactions, liabilities] = await Promise.all([
    getTransactionsSince(userId, '2000-01-01'),
    getInvestmentTransactionsSince(userId, '2000-01-01'),
    getLiabilitiesForUser(userId),
  ]);

  const budget = generateBudgetFromHistory({ userId, transactions, liabilities, investmentTransactions });

  await budgetRepository.saveBudget(budget);

  return budget;
}

/**
 * Applies a partial category update to the user's current budget.
 * Merges the update onto the latest budget via spread, then saves the result
 * as a new record with a fresh ULID budgetId and updated createdAt timestamp.
 * Unspecified categories carry forward unchanged.
 *
 * BudgetUpdateInput is Partial<> of only category fields — userId, budgetId,
 * and createdAt are absent from the type, so spreading is safe.
 *
 * @param {string} userId
 * @param {BudgetUpdateInput} updates - Category fields to update.
 * @returns {Promise<Budget>} The merged budget that was saved.
 * @throws {NotFoundError} If no budget exists for the user.
 */
export async function updateBudget(userId: string, updates: BudgetUpdateInput): Promise<Budget> {
  const latest = await budgetRepository.getLatestBudget(userId);

  if (!latest) {
    throw new NotFoundError('No budget found. Connect a bank account to get started.');
  }

  const updated: Budget = {
    ...latest,
    ...updates,
    budgetId: ulid(),
    createdAt: new Date().toISOString(),
  };

  await budgetRepository.saveBudget(updated);
  return updated;
}

/**
 * Returns the user's most recent budget, or null if none exists.
 * Delegates directly to the repository.
 *
 * @param {string} userId
 * @returns {Promise<Budget | null>}
 */
export async function getLatestBudget(userId: string): Promise<Budget | null> {
  return budgetRepository.getLatestBudget(userId);
}

/**
 * Returns the full budget history for a user, newest first.
 * Delegates directly to the repository.
 *
 * @param {string} userId
 * @returns {Promise<Budget[]>}
 */
export async function getBudgetHistory(userId: string): Promise<Budget[]> {
  return budgetRepository.getBudgetHistory(userId);
}
