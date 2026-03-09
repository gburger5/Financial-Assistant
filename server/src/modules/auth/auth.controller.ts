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
import type { RegisterRouteGeneric, LoginRouteGeneric, ResendVerificationRouteGeneric, UpdateNameRouteGeneric, UpdatePasswordRouteGeneric, UpdateEmailRouteGeneric } from './auth.schema.js';

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

/**
 * Handles GET /verify-email.
 * Delegates to the service to verify the email based on the token, then
 * returns a simple success message. The service will throw if the token is invalid
 * or expired.
 *
 * @param {FastifyRequest<{ Querystring: { token: string } }>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function verifyEmail(
  request: FastifyRequest<{ Querystring: { token: string } }>,
  reply: FastifyReply
) {
  const { token } = request.query;

  await authService.verifyEmail(token);

  return reply.send({ success: true });
}

/**
 * Handles POST /resend-verification.
 * Delegates to the service to resend the verification email. The service will
 * throw if the email is not found or if the email is already verified, but we do not
 * need to distinguish these cases in the response, so we return success regardless.
 *
 * @param {FastifyRequest<ResendVerificationRouteGeneric>} request
 * @param {FastifyReply} reply
 * @return {Promise<void>}
 */
export async function resendVerification(
  request: FastifyRequest<ResendVerificationRouteGeneric>,
  reply: FastifyReply
) {
  const { email } = request.body;

  await authService.resendVerificationEmail(email);

  return reply.send({ success: true });
}

/**
 * Handles PATCH /profile/name.
 * Updates the authenticated user's first and last name.
 *
 * @param {FastifyRequest<UpdateNameRouteGeneric>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function updateName(
  request: FastifyRequest<UpdateNameRouteGeneric>,
  reply: FastifyReply
): Promise<void> {
  const { userId } = request.user as { userId: string };
  const { firstName, lastName } = request.body;

  const user = await authService.updateName(userId, firstName, lastName);
  return reply.status(200).send(user);
}

/**
 * Handles PATCH /profile/password.
 * Validates that newPassword and confirmNewPassword match, then delegates
 * to the service to verify the current password and apply the change.
 *
 * @param {FastifyRequest<UpdatePasswordRouteGeneric>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 * @throws {BadRequestError} When passwords do not match.
 */
export async function updatePassword(
  request: FastifyRequest<UpdatePasswordRouteGeneric>,
  reply: FastifyReply
): Promise<void> {
  const { userId } = request.user as { userId: string };
  const { currentPassword, newPassword, confirmNewPassword } = request.body;

  if (newPassword !== confirmNewPassword) {
    throw new BadRequestError('Passwords do not match');
  }

  await authService.updatePassword(userId, currentPassword, newPassword);
  return reply.status(200).send({ success: true });
}

/**
 * Handles PATCH /profile/email.
 * Initiates an email change by sending a verification email to the new address.
 * The email is not changed until the user verifies the new address.
 *
 * @param {FastifyRequest<UpdateEmailRouteGeneric>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function updateEmail(
  request: FastifyRequest<UpdateEmailRouteGeneric>,
  reply: FastifyReply
): Promise<void> {
  const { userId } = request.user as { userId: string };
  const { newEmail, currentPassword } = request.body;

  await authService.initiateEmailChange(userId, newEmail, currentPassword);
  return reply.status(200).send({ success: true });
}