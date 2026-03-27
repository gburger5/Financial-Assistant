/**
 * @module agents.route
 * @description Fastify route plugin for the Agent HTTP endpoints.
 *
 * Routes (relative to the registered prefix /api/agent):
 *   POST  /budget                          — Run budget agent (auth required)
 *   POST  /debt                            — Run debt agent (auth required)
 *   POST  /investing                       — Run investing agent (auth required)
 *   GET   /proposals                       — List proposals, optional ?agentType filter (auth required)
 *   GET   /proposals/:proposalId           — Get single proposal (auth required)
 *   POST  /proposals/:proposalId/approve   — Approve a pending proposal (auth required)
 *   POST  /proposals/:proposalId/reject    — Reject a pending proposal (auth required)
 *   POST  /proposals/:proposalId/execute   — Execute an approved proposal (auth required)
 *
 * Register in app.ts with: app.register(agentRoutes, { prefix: '/api/agent' })
 */
import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../plugins/auth.plugin.js';
import {
  runBudgetAgent,
  runDebtAgent,
  runInvestingAgent,
  getProposal,
  getProposalHistory,
  approveProposal,
  rejectProposal,
  executeProposal,
} from './agents.controller.js';
import type { RunDebtAgentBody, RunInvestingAgentBody } from './agents.types.js';

/** JSON Schema for a proposal response body. Uses permissive result type. */
const proposalResponseSchema = {
  type: 'object',
  properties: {
    userId: { type: 'string' },
    proposalId: { type: 'string' },
    agentType: { type: 'string', enum: ['budget', 'debt', 'investing'] },
    status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'executed'] },
    result: { type: 'object', additionalProperties: true },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

/**
 * Registers all /api/agent routes on the Fastify instance.
 *
 * @param {FastifyInstance} fastify
 * @returns {Promise<void>}
 */
async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /budget
   * Runs the budget agent and returns a pending proposal.
   * No body required — userId comes from JWT.
   */
  fastify.post('/budget', {
    preHandler: [verifyJWT],
    schema: {
      response: { 201: proposalResponseSchema },
    },
  }, runBudgetAgent);

  /**
   * POST /debt
   * Runs the debt agent with the user's debt allocation amount.
   */
  fastify.post<{ Body: RunDebtAgentBody }>('/debt', {
    preHandler: [verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['debtAllocation'],
        additionalProperties: false,
        properties: {
          debtAllocation: { type: 'number', minimum: 0 },
        },
      },
      response: { 201: proposalResponseSchema },
    },
  }, runDebtAgent);

  /**
   * POST /investing
   * Runs the investing agent with the user's investing allocation amount.
   */
  fastify.post<{ Body: RunInvestingAgentBody }>('/investing', {
    preHandler: [verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['investingAllocation'],
        additionalProperties: false,
        properties: {
          investingAllocation: { type: 'number', minimum: 0 },
        },
      },
      response: { 201: proposalResponseSchema },
    },
  }, runInvestingAgent);

  /**
   * GET /proposals
   * Returns proposal history, optionally filtered by ?agentType=budget|debt|investing.
   */
  fastify.get('/proposals', {
    preHandler: [verifyJWT],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          agentType: { type: 'string', enum: ['budget', 'debt', 'investing'] },
        },
        additionalProperties: false,
      },
      response: {
        200: { type: 'array', items: proposalResponseSchema },
      },
    },
  }, getProposalHistory);

  /**
   * GET /proposals/:proposalId
   * Returns a single proposal by ID.
   */
  fastify.get<{ Params: { proposalId: string } }>('/proposals/:proposalId', {
    preHandler: [verifyJWT],
    schema: {
      params: {
        type: 'object',
        required: ['proposalId'],
        properties: {
          proposalId: { type: 'string' },
        },
      },
      response: { 200: proposalResponseSchema },
    },
  }, getProposal);

  /**
   * POST /proposals/:proposalId/approve
   * Approves a pending proposal (no side effects — execution is separate).
   */
  fastify.post<{ Params: { proposalId: string } }>('/proposals/:proposalId/approve', {
    preHandler: [verifyJWT],
    schema: {
      params: {
        type: 'object',
        required: ['proposalId'],
        properties: {
          proposalId: { type: 'string' },
        },
      },
      response: { 200: proposalResponseSchema },
    },
  }, approveProposal);

  /**
   * POST /proposals/:proposalId/reject
   * Rejects a pending proposal.
   */
  fastify.post<{ Params: { proposalId: string } }>('/proposals/:proposalId/reject', {
    preHandler: [verifyJWT],
    schema: {
      params: {
        type: 'object',
        required: ['proposalId'],
        properties: {
          proposalId: { type: 'string' },
        },
      },
      response: { 200: proposalResponseSchema },
    },
  }, rejectProposal);

  /**
   * POST /proposals/:proposalId/execute
   * Executes an approved proposal by creating real financial records.
   */
  fastify.post<{ Params: { proposalId: string } }>('/proposals/:proposalId/execute', {
    preHandler: [verifyJWT],
    schema: {
      params: {
        type: 'object',
        required: ['proposalId'],
        properties: {
          proposalId: { type: 'string' },
        },
      },
      response: { 200: proposalResponseSchema },
    },
  }, executeProposal);
}

export default agentRoutes;
