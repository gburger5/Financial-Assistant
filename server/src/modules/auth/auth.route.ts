/**
 * @module auth.route
 * @description Fastify plugin that registers all /api/auth routes.
 * Attaches schemas for validation and serialisation, applies the verifyJWT
 * preHandler on protected routes, and delegates to controller functions.
 * Register this plugin in app.ts with prefix: '/api/auth'.
 */
import type { FastifyInstance } from 'fastify';
import { register, login, verify } from './auth.controller.js';
import { registerSchema, loginSchema, verifySchema } from './auth.schema.js';
import { verifyJWT } from '../../plugins/auth.plugin.js';

/**
 * Registers the auth routes on the provided Fastify instance.
 * Does not use fastify-plugin (fp) wrapping because route plugins are
 * intentionally encapsulated — they add no decorators to the parent scope.
 *
 * Routes:
 *   POST /register — open, creates a new user account
 *   POST /login    — open, returns a JWT on valid credentials
 *   GET  /verify   — protected, echoes the decoded JWT payload
 *
 * @param {FastifyInstance} fastify
 * @returns {Promise<void>}
 */
export default async function authRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post('/register', { schema: registerSchema }, register);
  fastify.post('/login', { schema: loginSchema }, login);
  fastify.get('/verify', { schema: verifySchema, preHandler: verifyJWT }, verify);
}
