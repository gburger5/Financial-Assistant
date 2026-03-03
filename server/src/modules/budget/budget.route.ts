/**
 * @module budget.route
 * @description Fastify route plugin for the Budget HTTP endpoints.
 *
 * Routes (relative to the registered prefix /api/budget):
 *   POST  /initialize — Generate the initial budget from transaction history (auth required)
 *   GET   /           — Retrieve the user's latest budget (auth required)
 *   PATCH /           — Update one or more category amounts (auth required)
 *   GET   /history    — Retrieve the full budget version history (auth required)
 *
 * Security notes:
 *   - verifyJWT preHandler protects all three routes.
 *   - additionalProperties: false on the PATCH body schema strips any system
 *     fields (userId, budgetId, createdAt) the client might send before the
 *     request reaches the controller — prevents mass assignment.
 *   - minimum: 0 on BudgetAmount.amount rejects negative values at the
 *     schema layer so the controller never receives invalid data.
 *
 * Register this plugin in app.ts with prefix: '/api/budget'.
 */
import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../plugins/auth.plugin.js';
import { getBudget, initializeBudget, patchBudget, getHistory } from './budget.controller.js';
import type { BudgetUpdateInput } from './budget.types.js';

/** JSON Schema for a single BudgetAmount object. */
const budgetAmountSchema = {
  type: 'object',
  properties: {
    amount: { type: 'number', minimum: 0 },
  },
  required: ['amount'],
  additionalProperties: false,
} as const;

/** JSON Schema for a full Budget in response bodies. */
const budgetResponseSchema = {
  type: 'object',
  properties: {
    userId: { type: 'string' },
    budgetId: { type: 'string' },
    createdAt: { type: 'string' },
    income: budgetAmountSchema,
    housing: budgetAmountSchema,
    utilities: budgetAmountSchema,
    transportation: budgetAmountSchema,
    groceries: budgetAmountSchema,
    takeout: budgetAmountSchema,
    shopping: budgetAmountSchema,
    personalCare: budgetAmountSchema,
    debts: budgetAmountSchema,
    investments: budgetAmountSchema,
  },
} as const;

/**
 * Registers all /api/budget routes on the Fastify instance.
 * Call with app.register(budgetRoutes, { prefix: '/api/budget' }).
 *
 * @param {FastifyInstance} fastify
 * @returns {Promise<void>}
 */
async function budgetRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * POST /initialize
   * Generates the user's initial budget from their full transaction and
   * liability history. Idempotent — returns the existing budget unchanged
   * if one already exists (e.g. user linking a second bank account).
   * Called by the frontend once triggerInitialSync completes.
   */
  fastify.post('/initialize', {
    preHandler: [verifyJWT],
    schema: {
      response: {
        201: budgetResponseSchema,
      },
    },
  }, initializeBudget);

  /**
   * GET /
   * Returns the authenticated user's most recent budget.
   * 404 if no budget exists (e.g. no bank linked yet).
   */
  fastify.get('/', {
    preHandler: [verifyJWT],
    schema: {
      response: {
        200: budgetResponseSchema,
      },
    },
  }, getBudget);

  /**
   * PATCH /
   * Merges the provided category amounts onto the user's current budget,
   * creating a new versioned record. All category fields are optional.
   * System fields (userId, budgetId, createdAt) are stripped by
   * additionalProperties: false before reaching the controller.
   */
  fastify.patch<{ Body: BudgetUpdateInput }>('/', {
    preHandler: [verifyJWT],
    schema: {
      body: {
        type: 'object',
        properties: {
          income: budgetAmountSchema,
          housing: budgetAmountSchema,
          utilities: budgetAmountSchema,
          transportation: budgetAmountSchema,
          groceries: budgetAmountSchema,
          takeout: budgetAmountSchema,
          shopping: budgetAmountSchema,
          personalCare: budgetAmountSchema,
          debts: budgetAmountSchema,
          investments: budgetAmountSchema,
        },
        additionalProperties: false,
      },
      response: {
        200: budgetResponseSchema,
      },
    },
  }, patchBudget);

  /**
   * GET /history
   * Returns all budget versions for the user in reverse chronological order.
   */
  fastify.get('/history', {
    preHandler: [verifyJWT],
    schema: {
      response: {
        200: {
          type: 'array',
          items: budgetResponseSchema,
        },
      },
    },
  }, getHistory);
}

export default budgetRoutes;
