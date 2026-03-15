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
import type {
  RegisterRouteGeneric,
  LoginRouteGeneric,
  ResendVerificationRouteGeneric,
  UpdateNameRouteGeneric,
  UpdatePasswordRouteGeneric,
  UpdateEmailRouteGeneric,
  LogoutRouteGeneric,
  RefreshRouteGeneric,
  ForgotPasswordRouteGeneric,
  ResetPasswordRouteGeneric,
  DeleteAccountRouteGeneric,
} from './auth.schema.js';

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
 * Does a fresh DB read so the response always reflects the latest user state,
 * including onboarding flags that are updated server-side after JWT issuance
 * (e.g. agentBudgetApproved set when a budget proposal is accepted).
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function verify(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await authService.getUserById(request.user!.userId);
  return reply.status(200).send(user);
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
 * Delegates to the service to resend the verification email.
 *
 * @param {FastifyRequest<ResendVerificationRouteGeneric>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
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
  const { userId, jti, exp } = request.user as { userId: string; jti: string; exp: number };
  const { currentPassword, newPassword, confirmNewPassword } = request.body;

  if (newPassword !== confirmNewPassword) {
    throw new BadRequestError('Passwords do not match');
  }

  await authService.updatePassword(userId, currentPassword, newPassword, jti, exp);
  return reply.status(200).send({ success: true });
}

/**
 * Handles PATCH /profile/email.
 * Initiates an email change by sending a verification email to the new address.
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

/**
 * Handles POST /logout.
 * Reads the `jti` and `exp` from the verified JWT payload, revokes the access
 * token, and optionally deletes the refresh token if its id is in the body.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function logout(
  request: FastifyRequest<LogoutRouteGeneric>,
  reply: FastifyReply
): Promise<void> {
  const { userId, jti, exp } = request.user as { userId: string; jti: string; exp: number };
  const { refreshToken } = request.body;
  await authService.logoutUser(jti, userId, exp, refreshToken);
  return reply.status(200).send({ success: true });
}

/**
 * Handles POST /refresh.
 * Exchanges a valid refresh token for a new access + refresh token pair.
 *
 * @param {FastifyRequest<RefreshRouteGeneric>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function refresh(
  request: FastifyRequest<RefreshRouteGeneric>,
  reply: FastifyReply
): Promise<void> {
  const { refreshToken } = request.body;
  const result = await authService.refreshAccessToken(refreshToken);
  return reply.status(200).send(result);
}

/**
 * Handles POST /forgot-password.
 * Always responds 200 to prevent user enumeration.
 *
 * @param {FastifyRequest<ForgotPasswordRouteGeneric>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function forgotPasswordHandler(
  request: FastifyRequest<ForgotPasswordRouteGeneric>,
  reply: FastifyReply
): Promise<void> {
  const { email } = request.body;
  await authService.forgotPassword(email);
  return reply.status(200).send({ success: true });
}

/**
 * Handles POST /reset-password.
 * Validates passwords match then delegates to the service.
 *
 * @param {FastifyRequest<ResetPasswordRouteGeneric>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 * @throws {BadRequestError} When passwords do not match.
 */
export async function resetPasswordHandler(
  request: FastifyRequest<ResetPasswordRouteGeneric>,
  reply: FastifyReply
): Promise<void> {
  const { token, newPassword, confirmNewPassword } = request.body;

  if (newPassword !== confirmNewPassword) {
    throw new BadRequestError('Passwords do not match');
  }

  await authService.resetPassword(token, newPassword);
  return reply.status(200).send({ success: true });
}

/**
 * Handles DELETE /account.
 * Verifies current password, revokes all sessions, deletes the account.
 *
 * @param {FastifyRequest<DeleteAccountRouteGeneric>} request
 * @param {FastifyReply} reply
 * @returns {Promise<void>}
 */
export async function deleteAccountHandler(
  request: FastifyRequest<DeleteAccountRouteGeneric>,
  reply: FastifyReply
): Promise<void> {
  const { userId, jti, exp } = request.user as { userId: string; jti: string; exp: number };
  const { currentPassword } = request.body;
  await authService.deleteAccount(userId, currentPassword, jti, exp);
  return reply.status(200).send({ success: true });
}