/**
 * @module auth.plugin
 * @description Fastify JWT authentication plugin.
 * Exports a single preHandler — verifyJWT — that validates the access token
 * stored in the httpOnly `accessToken` cookie, checks it against the
 * revocation list, and attaches the decoded payload to request.user.
 *
 * Tokens are transmitted as httpOnly cookies (set by the login/refresh
 * handlers) so they are never accessible to client-side JavaScript.
 *
 * Usage:
 *   fastify.get('/protected', { preHandler: verifyJWT }, handler)
 *
 * Failure cases (all result in 401):
 *   "No token provided"      — accessToken cookie absent or empty
 *   "Invalid token"          — bad signature, malformed, no jti, or wrong alg
 *   "Token expired"          — token past its exp claim
 *   "Token has been revoked" — jti found in the revocation list
 */
import jwt from 'jsonwebtoken';
import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../lib/errors.js';
import {
  isAccessTokenRevoked,
  isSessionsInvalidatedForUser,
} from '../modules/auth/auth-tokens.repository.js';

/** Shape of the payload stored inside every JWT issued by this service. */
interface JWTPayload {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  jti: string;
  iat?: number;
  exp?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: JWTPayload;
    rawBody?: string;
  }
}

/**
 * Fastify preHandler that verifies the Bearer JWT in the Authorization header.
 * After successful cryptographic verification it checks the jti against the
 * revocation list so logged-out tokens are rejected even within their 15-min
 * validity window.
 *
 * On success the decoded payload is attached to request.user so downstream
 * handlers can access { userId, email, jti, exp } without re-decoding.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @throws {UnauthorizedError} When the token is absent, invalid, or revoked.
 */
export async function verifyJWT(
  request: FastifyRequest,
): Promise<void> {
  const token = request.cookies?.accessToken;

  if (!token) {
    throw new UnauthorizedError('No token provided');
  }
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV !== 'development') {
    throw new Error('JWT_SECRET environment variable is required');
  }
  let decoded: JWTPayload;
  try {
    // Explicitly whitelist HS256 to prevent algorithm-confusion attacks.
    decoded = jwt.verify(token, secret ?? 'test-secret-key', {
      algorithms: ['HS256'],
    }) as JWTPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token expired');
    }
    throw new UnauthorizedError('Invalid token');
  }
  // Reject tokens without a jti — they cannot be individually revoked
  // and were issued before this feature was added.
  if (!decoded.jti) {
    throw new UnauthorizedError('Invalid token');
  }
  // Check revocation list (logout blocklist) and per-user session invalidation
  // (password reset) in parallel to keep the overhead to one extra round-trip.
  const [revoked, sessionInvalidated] = await Promise.all([
    isAccessTokenRevoked(decoded.jti),
    isSessionsInvalidatedForUser(decoded.userId, decoded.iat ?? 0),
  ]);
  if (revoked || sessionInvalidated) {
    throw new UnauthorizedError('Token has been revoked');
  }
  request.user = decoded;
}