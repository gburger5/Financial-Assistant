/**
 * @module budget.controller
 * @description HTTP boundary for the Budget module.
 * Translates FastifyRequest inputs into service calls and sends results back
 * as HTTP responses. Contains no business logic — only extraction and delegation.
 * No try/catch: errors propagate to the global error handler.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import * as budgetService from './budget.service.js';
import { NotFoundError } from '../../lib/errors.js';
import type { BudgetGoal, BudgetUpdateInput } from './budget.types.js';

/**
 * Handles POST /budget/initialize.
 * Generates the user's initial budget from their full transaction and liability
 * history, using the goals selected by the user during onboarding.
 * If a budget already exists (e.g. the user linked a second bank account),
 * returns the existing budget unchanged — createInitialBudget is idempotent.
 *
 * @param {FastifyRequest<{ Body: { goals: BudgetGoal[] } }>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function initializeBudget(
  request: FastifyRequest<{ Body: { goals: BudgetGoal[] } }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user!.userId;
  const { goals } = request.body;
  const budget = await budgetService.createInitialBudget(userId, goals);
  return reply.status(201).send(budget);
}

/**
 * Handles GET /budget.
 * Returns the user's most recent budget.
 * Throws NotFoundError (404) when no budget exists — the message tells the
 * frontend to prompt the user to connect a bank account. Returning null would
 * require the client to synthesize its own error message.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 * @throws {NotFoundError} When no budget exists for the user.
 */
export async function getBudget(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = request.user!.userId;
  const budget = await budgetService.getLatestBudget(userId);

  if (!budget) {
    throw new NotFoundError('Connect a bank account to get started');
  }

  return reply.send(budget);
}

/**
 * Handles PATCH /budget.
 * Merges the validated request body onto the user's current budget.
 * The Fastify schema on this route uses additionalProperties: false to strip
 * any system fields (userId, budgetId, createdAt) before this handler runs.
 *
 * @param {FastifyRequest<{ Body: BudgetUpdateInput }>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function patchBudget(
  request: FastifyRequest<{ Body: BudgetUpdateInput }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user!.userId;
  const updates = request.body;
  const updated = await budgetService.updateBudget(userId, updates);
  return reply.send(updated);
}

/**
 * Handles GET /budget/history.
 * Returns the full budget history for the user, newest first.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function getHistory(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = request.user!.userId;
  const history = await budgetService.getBudgetHistory(userId);
  return reply.send(history);
}
