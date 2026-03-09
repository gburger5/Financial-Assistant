/**
 * @module auth.plugin
 * @description Fastify JWT authentication plugin.
 * Exports a single preHandler — verifyJWT — that validates the Bearer token
 * in the Authorization header, checks it against the revocation list, and
 * attaches the decoded payload to request.user.
 *
 * Usage:
 *   fastify.get('/protected', { preHandler: verifyJWT }, handler)
 *
 * Failure cases (all result in 401):
 *   "No token provided"    — header absent or wrong scheme
 *   "Invalid token"        — bad signature, malformed, no jti, or wrong alg
 *   "Token has been revoked" — jti found in the revocation list
 *
 * Note: "Token expired" is intentionally subsumed under "Invalid token"
 * here because the route-level schema response does not need to distinguish
 * the cases and over-disclosure is avoided. If you need distinct messages,
 * catch jwt.TokenExpiredError separately.
 */
import jwt from 'jsonwebtoken';
import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../lib/errors.js';
import { isAccessTokenRevoked } from '../modules/auth/auth-tokens.repository.js';

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
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('No token provided');
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new UnauthorizedError('No token provided');
  }
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
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
  // Check revocation list (logout blocklist).
  const revoked = await isAccessTokenRevoked(decoded.jti);
  if (revoked) {
    throw new UnauthorizedError('Token has been revoked');
  }
  request.user = decoded;
}