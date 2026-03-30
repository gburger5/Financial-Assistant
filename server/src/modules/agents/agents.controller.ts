/**
 * @module agents.controller
 * @description HTTP boundary for the Agents module.
 * Translates FastifyRequest inputs into service calls and sends results back
 * as HTTP responses. Contains no business logic — only extraction and delegation.
 * No try/catch: errors propagate to the global error handler.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import * as agentsService from './agents.service.js';
import type { AgentType, RunDebtAgentBody, RunInvestingAgentBody } from './agents.types.js';

/**
 * Handles POST /agent/budget.
 * Runs the budget agent for the authenticated user and returns the new proposal.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function runBudgetAgent(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = request.user!.userId;
  const proposal = await agentsService.runBudgetAgent(userId);
  return reply.status(201).send(proposal);
}

/**
 * Handles POST /agent/debt.
 * Runs the debt agent with the user's debt allocation and returns the new proposal.
 *
 * @param {FastifyRequest<{ Body: RunDebtAgentBody }>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function runDebtAgent(
  request: FastifyRequest<{ Body: RunDebtAgentBody }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user!.userId;
  const { debtAllocation } = request.body;
  const proposal = await agentsService.runDebtAgent(userId, debtAllocation);
  return reply.status(201).send(proposal);
}

/**
 * Handles POST /agent/investing.
 * Runs the investing agent with the user's investing allocation and returns
 * the new proposal.
 *
 * @param {FastifyRequest<{ Body: RunInvestingAgentBody }>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function runInvestingAgent(
  request: FastifyRequest<{ Body: RunInvestingAgentBody }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user!.userId;
  const { investingAllocation } = request.body;
  const proposal = await agentsService.runInvestingAgent(userId, investingAllocation);
  return reply.status(201).send(proposal);
}

/**
 * Handles GET /agent/proposals/:proposalId.
 * Returns a single proposal by its ID.
 *
 * @param {FastifyRequest<{ Params: { proposalId: string } }>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function getProposal(
  request: FastifyRequest<{ Params: { proposalId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user!.userId;
  const { proposalId } = request.params;
  const proposal = await agentsService.getProposal(userId, proposalId);
  return reply.send(proposal);
}

/**
 * Handles GET /agent/proposals.
 * Returns proposal history, optionally filtered by agent type.
 *
 * @param {FastifyRequest<{ Querystring: { agentType?: AgentType } }>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function getProposalHistory(
  request: FastifyRequest<{ Querystring: { agentType?: AgentType } }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user!.userId;
  const { agentType } = request.query as { agentType?: AgentType };

  const proposals = agentType
    ? await agentsService.getProposalsByType(userId, agentType)
    : await agentsService.getProposalHistory(userId);

  return reply.send(proposals);
}

/**
 * Handles POST /agent/proposals/:proposalId/approve.
 * Approves a pending proposal (no side effects — execution is separate).
 *
 * @param {FastifyRequest<{ Params: { proposalId: string } }>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function approveProposal(
  request: FastifyRequest<{ Params: { proposalId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user!.userId;
  const { proposalId } = request.params;
  const proposal = await agentsService.approveProposal(userId, proposalId);
  return reply.send(proposal);
}

/**
 * Handles POST /agent/proposals/:proposalId/reject.
 * Rejects a pending proposal.
 *
 * @param {FastifyRequest<{ Params: { proposalId: string } }>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function rejectProposal(
  request: FastifyRequest<{ Params: { proposalId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user!.userId;
  const { proposalId } = request.params;
  const proposal = await agentsService.rejectProposal(userId, proposalId);
  return reply.send(proposal);
}

/**
 * Handles POST /agent/proposals/:proposalId/execute.
 * Executes an approved proposal by creating real financial records.
 *
 * @param {FastifyRequest<{ Params: { proposalId: string } }>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function executeProposal(
  request: FastifyRequest<{ Params: { proposalId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user!.userId;
  const { proposalId } = request.params;
  const proposal = await agentsService.executeProposal(userId, proposalId);
  return reply.send(proposal);
}
