/**
 * @module auth.plugin
 * @description JWT preHandler middleware for protecting Fastify routes.
 *
 * Usage — add as a preHandler on any route that requires authentication:
 *   import { verifyJWT } from './plugins/auth.plugin.js'
 *   fastify.get('/secret', { preHandler: verifyJWT }, handler)
 *
 * On success the decoded JWT payload is attached to `request.user`.
 * On failure one of three UnauthorizedErrors is thrown and the global error
 * handler converts it to a consistent 401 JSON response.
 *
 * Security notes:
 * - Algorithm is explicitly whitelisted to HS256; alg:none is always rejected.
 * - JWT_SECRET is read lazily at call time (not at module load) so tests can
 *   set process.env.JWT_SECRET before the first request.
 * - This middleware only verifies the token. Early invalidation (revocation) is
 *   handled by a separate DB lookup elsewhere.
 */
import jwt from 'jsonwebtoken';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../lib/errors.js';

/** Shape of the payload stored inside every JWT issued by this service. */
interface JWTPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  jti: string;
}

// Augment the Fastify request interface so TypeScript knows about request.user
// and request.rawBody across the entire application without casts at call sites.
// rawBody is populated by the scoped content-type parser in plaid.route.ts
// so that the webhook signature verifier gets the exact bytes Plaid signed.
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
    rawBody?: string;
  }
}

/**
 * Reads the JWT secret from the environment at call time.
 * Falls back to a fixed development key in non-production so the app starts
 * without configuration; this key is meaningless outside tests/dev.
 *
 * @returns {string} The secret used for HS256 verification.
 */
function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    // Hard fail at runtime rather than silently use a weak fallback.
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  return secret ?? 'test-secret-key';
}

/**
 * Fastify preHandler that verifies the JWT in the Authorization header.
 *
 * Three distinct failure messages let callers distinguish the cases without
 * inspecting error types, and match the strings asserted in the spec:
 *   "No token provided"  — header absent or not Bearer scheme
 *   "Token expired"      — valid signature but past exp
 *   "Invalid token"      — bad signature, malformed, wrong algorithm, etc.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} _reply - Unused; errors are thrown not replied.
 * @returns {Promise<void>}
 * @throws {UnauthorizedError}
 */
export async function verifyJWT(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  // Require "Bearer <token>" — reject absent header, wrong scheme, empty token.
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('No token provided');
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new UnauthorizedError('No token provided');
  }

  try {
    // Explicitly whitelist HS256 to prevent algorithm-confusion attacks.
    // jwt.verify will throw JsonWebTokenError for alg:none or any other algo.
    const decoded = jwt.verify(token, getSecret(), {
      algorithms: ['HS256'],
    }) as JWTPayload;

    request.user = decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token expired');
    }
    // Covers JsonWebTokenError (bad signature, malformed, wrong alg) and
    // NotBeforeError — all map to "Invalid token" per the spec.
    throw new UnauthorizedError('Invalid token');
  }
}
