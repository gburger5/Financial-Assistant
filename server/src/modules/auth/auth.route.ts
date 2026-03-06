/**
 * @module auth.route
 * @description Fastify plugin that registers all /api/auth routes.
 * Attaches schemas for validation and serialisation, applies the verifyJWT
 * preHandler on protected routes, and delegates to controller functions.
 * Register this plugin in app.ts with prefix: '/api/auth'.
 */
import type { FastifyInstance } from 'fastify';
import { register, login, verify, verifyEmail, resendVerification, updateName, updateEmail, updatePassword } from './auth.controller.js';
import { registerSchema, loginSchema, verifySchema, resendVerificationSchema, verifyEmailSchema, updateNameSchema, updateEmailSchema, updatePasswordSchema } from './auth.schema.js';
import type { UpdateNameRouteGeneric, UpdatePasswordRouteGeneric, UpdateEmailRouteGeneric } from './auth.schema.js';
import { verifyJWT } from '../../plugins/auth.plugin.js';

/**
 * Registers the auth routes on the provided Fastify instance.
 * Does not use fastify-plugin (fp) wrapping because route plugins are
 * intentionally encapsulated — they add no decorators to the parent scope.
 *
 * Routes:
 *   POST  /register             — open, creates a new user account
 *   POST  /login                — open, returns a JWT on valid credentials
 *   POST  /resend-verification  — open, resends email verification link
 *   GET   /verify               — protected, echoes the decoded JWT payload
 *   GET   /verify-email         — open, verifies email using token query param
 *   PATCH /profile/name         — protected, updates first and last name
 *   PATCH /profile/password     — protected, updates password (requires current password)
 *   PATCH /profile/email        — protected, initiates email change (requires verification)
 *
 * @param {FastifyInstance} fastify
 * @returns {Promise<void>}
 */
export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/register', { schema: registerSchema }, register);
  fastify.post('/login', { schema: loginSchema }, login);
  fastify.post('/resend-verification', { schema: resendVerificationSchema, config: { rateLimit: { max: 5, timeWindow: 60000 } } }, resendVerification);
  fastify.get('/verify', { schema: verifySchema, preHandler: verifyJWT }, verify);
  fastify.get('/verify-email', { schema: verifyEmailSchema }, verifyEmail);
  fastify.patch<UpdateNameRouteGeneric>('/profile/name', { schema: updateNameSchema, preHandler: verifyJWT }, updateName);
  fastify.patch<UpdatePasswordRouteGeneric>('/profile/password', { schema: updatePasswordSchema, preHandler: verifyJWT, config: { rateLimit: { max: 5, timeWindow: 60000 } } }, updatePassword);
  fastify.patch<UpdateEmailRouteGeneric>('/profile/email', { schema: updateEmailSchema, preHandler: verifyJWT, config: { rateLimit: { max: 5, timeWindow: 60000 } } }, updateEmail);
}
