/**
 * @module agents.repository
 * @description DynamoDB persistence layer for agent proposals.
 *
 * DynamoDB schema:
 *   Table: Proposals
 *   PK: userId (HASH)
 *   SK: proposalId (RANGE) — a ULID, so lexicographic order = chronological order
 *
 * Every agent execution creates a new proposal via PutCommand (append-only).
 * Status transitions use UpdateCommand with a ConditionExpression to enforce
 * valid state machine transitions (pending → approved/rejected, approved → executed).
 */
import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db } from '../../db/index.js';
import { Tables } from '../../db/tables.js';
import type { Proposal, AgentType, ProposalStatus } from './agents.types.js';

/**
 * Persists a new proposal snapshot.
 * Always inserts a new record — never updates an existing one.
 * The ULID proposalId guarantees uniqueness and natural chronological order.
 *
 * @param {Proposal} proposal - The proposal to store.
 * @returns {Promise<void>}
 */
export async function saveProposal(proposal: Proposal): Promise<void> {
  await db.send(
    new PutCommand({
      TableName: Tables.Proposals,
      Item: proposal,
    }),
  );
}

/**
 * Retrieves a single proposal by its composite key.
 *
 * @param {string} userId
 * @param {string} proposalId
 * @returns {Promise<Proposal | null>} The proposal, or null if not found.
 */
export async function getProposalById(userId: string, proposalId: string): Promise<Proposal | null> {
  const result = await db.send(
    new GetCommand({
      TableName: Tables.Proposals,
      Key: { userId, proposalId },
    }),
  );

  return (result.Item as Proposal) ?? null;
}

/**
 * Retrieves the most recent proposal of a given agent type for a user.
 * Queries descending without Limit (DynamoDB applies Limit before FilterExpression,
 * so Limit: 1 + filter would miss records when the newest proposal is a
 * different type). Takes the first item after filtering.
 *
 * @param {string} userId
 * @param {AgentType} agentType
 * @returns {Promise<Proposal | null>}
 */
export async function getLatestProposal(userId: string, agentType: AgentType): Promise<Proposal | null> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Proposals,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'agentType = :agentType',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':agentType': agentType,
      },
      ScanIndexForward: false,
    }),
  );

  const items = result.Items;
  if (!items || items.length === 0) return null;
  return items[0] as Proposal;
}

/**
 * Retrieves the pending proposal of a given agent type for a user, if any.
 * Used as a duplicate guard — only one pending proposal per agent type is allowed.
 *
 * @param {string} userId
 * @param {AgentType} agentType
 * @returns {Promise<Proposal | null>}
 */
export async function getPendingProposal(userId: string, agentType: AgentType): Promise<Proposal | null> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Proposals,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'agentType = :agentType AND #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':agentType': agentType,
        ':status': 'pending',
      },
      ScanIndexForward: false,
    }),
  );

  const items = result.Items;
  if (!items || items.length === 0) return null;
  return items[0] as Proposal;
}

/**
 * Retrieves the full proposal history for a user, newest first.
 *
 * @param {string} userId
 * @returns {Promise<Proposal[]>}
 */
export async function getProposalHistory(userId: string): Promise<Proposal[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Proposals,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ScanIndexForward: false,
    }),
  );

  return (result.Items ?? []) as Proposal[];
}

/**
 * Retrieves all proposals of a given agent type for a user, newest first.
 *
 * @param {string} userId
 * @param {AgentType} agentType
 * @returns {Promise<Proposal[]>}
 */
export async function getProposalsByType(userId: string, agentType: AgentType): Promise<Proposal[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Proposals,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'agentType = :agentType',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':agentType': agentType,
      },
      ScanIndexForward: false,
    }),
  );

  return (result.Items ?? []) as Proposal[];
}

/**
 * Atomically transitions a proposal's status.
 * Uses a ConditionExpression to enforce that the proposal is currently in
 * the expected state — prevents invalid transitions (e.g. approving an
 * already-rejected proposal).
 *
 * @param {string} userId
 * @param {string} proposalId
 * @param {ProposalStatus} newStatus - The status to transition to.
 * @param {ProposalStatus} expectedCurrentStatus - The status the proposal must be in.
 * @returns {Promise<void>}
 * @throws {ConditionalCheckFailedException} If the current status does not match.
 */
export async function updateProposalStatus(
  userId: string,
  proposalId: string,
  newStatus: ProposalStatus,
  expectedCurrentStatus: ProposalStatus,
): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: Tables.Proposals,
      Key: { userId, proposalId },
      UpdateExpression: 'SET #status = :newStatus, updatedAt = :updatedAt',
      ConditionExpression: '#status = :expectedStatus',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':newStatus': newStatus,
        ':expectedStatus': expectedCurrentStatus,
        ':updatedAt': new Date().toISOString(),
      },
    }),
  );
}
