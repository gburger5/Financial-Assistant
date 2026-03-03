/**
 * @module auth.controller
 * @description HTTP boundary for the auth module.
 * Translates FastifyRequest inputs into service calls and sends results back
 * as HTTP responses. Contains minimal logic — only the password-mismatch check
 * that cannot be expressed in JSON Schema (cross-field equality).
 * No try/catch blocks: errors propagate to the global error handler.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import * as authService from './auth.service.js';
import { BadRequestError } from '../../lib/errors.js';
import type { RegisterRouteGeneric, LoginRouteGeneric } from './auth.schema.js';

/**
 * Handles POST /register.
 * Validates that password and confirmPassword are identical (a business rule
 * that cannot be expressed in JSON Schema), then delegates to the service.
 *
 * @param {FastifyRequest<RegisterRouteGeneric>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 * @throws {BadRequestError} When passwords do not match.
 */
export async function register(
  request: FastifyRequest<RegisterRouteGeneric>,
  reply: FastifyReply
): Promise<void> {
  const { firstName, lastName, email, password, confirmPassword } = request.body;

  if (password !== confirmPassword) {
    throw new BadRequestError('Passwords do not match');
  }

  const user = await authService.registerUser(email, password, firstName, lastName);
  return reply.status(201).send(user);
}

/**
 * Handles POST /login.
 * Delegates entirely to the service and forwards its result as 200.
 *
 * @param {FastifyRequest<LoginRouteGeneric>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function login(
  request: FastifyRequest<LoginRouteGeneric>,
  reply: FastifyReply
): Promise<void> {
  const { email, password } = request.body;
  const result = await authService.loginUser(email, password);
  return reply.status(200).send(result);
}

/**
 * Handles GET /verify.
 * Returns the decoded JWT payload already attached to request.user by the
 * verifyJWT preHandler. Does not hit the database.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function verify(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  return reply.status(200).send(request.user);
}
