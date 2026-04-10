/**
 * @module auth.route
 * @description Fastify plugin that registers all /api/auth routes.
 * Attaches schemas for validation and serialisation, applies the verifyJWT
 * preHandler on protected routes, and delegates to controller functions.
 * Register this plugin in app.ts with prefix: '/api/auth'.
 */
import type { FastifyInstance } from 'fastify';
import {
  register,
  login,
  verify,
  verifyEmail,
  resendVerification,
  updateName,
  updateEmail,
  updatePassword,
  logout,
  refresh,
  forgotPasswordHandler,
  resetPasswordHandler,
  deleteAccountHandler,
  updateProfile,
} from './auth.controller.js';
import {
  registerSchema,
  loginSchema,
  verifySchema,
  resendVerificationSchema,
  verifyEmailSchema,
  updateNameSchema,
  updateEmailSchema,
  updatePasswordSchema,
  logoutSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  deleteAccountSchema,
  updateProfileSchema,
} from './auth.schema.js';
import type {
  UpdateProfileRouteGeneric,
  UpdateNameRouteGeneric,
  UpdatePasswordRouteGeneric,
  UpdateEmailRouteGeneric,
  ForgotPasswordRouteGeneric,
  ResetPasswordRouteGeneric,
  DeleteAccountRouteGeneric,
} from './auth.schema.js';
import { verifyJWT } from '../../plugins/auth.plugin.js';

/**
 * Registers the auth routes on the provided Fastify instance.
 * Does not use fastify-plugin (fp) wrapping because route plugins are
 * intentionally encapsulated — they add no decorators to the parent scope.
 *
 * Routes:
 *   POST   /register            — open, creates a new user account
 *   POST   /login               — open, returns access JWT + refresh token on valid credentials
 *   POST   /logout              — protected, revokes access token and optionally refresh token
 *   POST   /refresh             — open, exchanges refresh token for a new access + refresh pair
 *   POST   /resend-verification — open, resends email verification link
 *   GET    /verify              — protected, echoes the decoded JWT payload
 *   GET    /verify-email        — open, verifies email using token query param
 *   POST   /forgot-password     — open, sends a password-reset email
 *   POST   /reset-password      — open, applies a new password using a reset token
 *   PATCH  /profile/name        — protected, updates first and last name
 *   PATCH  /profile/password    — protected, updates password (requires current password)
 *   PATCH  /profile/email       — protected, initiates email change (requires verification)
 *   DELETE /account             — protected, permanently deletes the authenticated user's account
 *
 * @param {FastifyInstance} fastify
 * @returns {Promise<void>}
 */
export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ------------------------------------------------------------------
  // Open routes (no auth required)
  // ------------------------------------------------------------------

  fastify.post(
    '/register',
    {
      schema: registerSchema,
      config: { rateLimit: { max: 5, timeWindow: 60_000 } },
    },
    register
  );

  fastify.post(
    '/login',
    {
      schema: loginSchema,
      config: { rateLimit: { max: 10, timeWindow: 60_000 } },
    },
    login
  );

  fastify.post(
    '/resend-verification',
    {
      schema: resendVerificationSchema,
      config: { rateLimit: { max: 5, timeWindow: 60_000 } },
    },
    resendVerification
  );

  fastify.get('/verify-email', { schema: verifyEmailSchema }, verifyEmail);

  fastify.post(
    '/refresh',
    {
      schema: refreshSchema,
      config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    },
    refresh
  );

  fastify.post<ForgotPasswordRouteGeneric>(
    '/forgot-password',
    {
      schema: forgotPasswordSchema,
      config: { rateLimit: { max: 5, timeWindow: 60_000 } },
    },
    forgotPasswordHandler
  );

  fastify.post<ResetPasswordRouteGeneric>(
    '/reset-password',
    {
      schema: resetPasswordSchema,
      config: { rateLimit: { max: 5, timeWindow: 60_000 } },
    },
    resetPasswordHandler
  );

  // ------------------------------------------------------------------
  // Protected routes (verifyJWT preHandler required)
  // ------------------------------------------------------------------

  fastify.get('/verify', { schema: verifySchema, preHandler: verifyJWT }, verify);

  fastify.post(
    '/logout',
    {
      schema: logoutSchema,
      preHandler: verifyJWT,
    },
    logout
  );

  fastify.patch<UpdateProfileRouteGeneric>(
    '/profile',
    { schema: updateProfileSchema, preHandler: verifyJWT },
    updateProfile
  );

  fastify.patch<UpdateNameRouteGeneric>(
    '/profile/name',
    { schema: updateNameSchema, preHandler: verifyJWT },
    updateName
  );

  fastify.patch<UpdatePasswordRouteGeneric>(
    '/profile/password',
    {
      schema: updatePasswordSchema,
      preHandler: verifyJWT,
      config: { rateLimit: { max: 5, timeWindow: 60_000 } },
    },
    updatePassword
  );

  fastify.patch<UpdateEmailRouteGeneric>(
    '/profile/email',
    {
      schema: updateEmailSchema,
      preHandler: verifyJWT,
      config: { rateLimit: { max: 5, timeWindow: 60_000 } },
    },
    updateEmail
  );

  fastify.delete<DeleteAccountRouteGeneric>(
    '/account',
    {
      schema: deleteAccountSchema,
      preHandler: verifyJWT,
      config: { rateLimit: { max: 3, timeWindow: 60_000 } },
    },
    deleteAccountHandler
  );
}
