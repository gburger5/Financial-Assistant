/**
 * @module auth.plugin.test
 * @description Integration tests for the verifyJWT Fastify preHandler.
 * Covers: missing / malformed header, expired token, wrong signature,
 * algorithm-none attack, missing jti claim, revoked token, and the happy path.
 *
 * The auth-tokens repository is fully mocked so no real DynamoDB is hit.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import errorHandlerPlugin from '../errorHandler.plugin.js';

// ---------------------------------------------------------------------------
// Mock the revocation-list repository before importing the plugin
// ---------------------------------------------------------------------------

const { mockIsRevoked, mockIsSessionsInvalidated } = vi.hoisted(() => ({
  mockIsRevoked: vi.fn(),
  mockIsSessionsInvalidated: vi.fn(),
}));

vi.mock('../../modules/auth/auth-tokens.repository.js', () => ({
  isAccessTokenRevoked: mockIsRevoked,
  isSessionsInvalidatedForUser: mockIsSessionsInvalidated,
}));

import { verifyJWT } from '../auth.plugin.js';

const TEST_SECRET = 'test-jwt-secret-for-auth-plugin-tests';

/**
 * Builds a minimal Fastify app with the error handler and a single protected
 * GET /protected route that echoes request.user back as JSON.
 */
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  app.get('/protected', { preHandler: verifyJWT }, async (request) => {
    return request.user;
  });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = TEST_SECRET;
  // Default: token is not in the revocation list and sessions are not invalidated
  mockIsRevoked.mockResolvedValue(false);
  mockIsSessionsInvalidated.mockResolvedValue(false);
});

let app: FastifyInstance;
afterEach(() => app?.close());

// ---------------------------------------------------------------------------
// Missing / malformed Authorization header
// ---------------------------------------------------------------------------

describe('verifyJWT — missing token', () => {
  it('returns 401 when Authorization header is absent', async () => {
    app = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/protected' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      statusCode: 401,
      error: 'UnauthorizedError',
      message: 'No token provided',
    });
  });

  it('returns 401 when Authorization header is not Bearer scheme', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('No token provided');
  });

  it('returns 401 when Bearer token value is empty', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer ' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('No token provided');
  });
});

// ---------------------------------------------------------------------------
// Expired token
// ---------------------------------------------------------------------------

describe('verifyJWT — expired token', () => {
  it('returns 401 with "Token expired" for a token past its exp', async () => {
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'u-1', email: 'a@b.com', jti: 'jti-expired' },
      TEST_SECRET,
      { expiresIn: 0 }
    );

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Token expired');
  });

  it('does not call isAccessTokenRevoked for expired tokens', async () => {
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'u-1', email: 'a@b.com', jti: 'jti-expired' },
      TEST_SECRET,
      { expiresIn: 0 }
    );

    await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(mockIsRevoked).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Invalid token (wrong signature / malformed)
// ---------------------------------------------------------------------------

describe('verifyJWT — invalid token', () => {
  it('returns 401 with "Invalid token" for a wrong-signature token', async () => {
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'u-1', email: 'a@b.com', jti: 'jti-1' },
      'wrong-secret'
    );

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid token');
  });

  it('returns 401 with "Invalid token" for a completely malformed string', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer not.a.jwt' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid token');
  });

  it('does not call isAccessTokenRevoked when the signature is invalid', async () => {
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'u-1', email: 'a@b.com', jti: 'jti-bad' },
      'wrong-secret'
    );

    await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(mockIsRevoked).not.toHaveBeenCalled();
  });

  it('only uses HS256 — rejects a token claiming alg:none', async () => {
    app = await buildTestApp();
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ userId: 'u-1', email: 'a@b.com', jti: 'jti-none' })
    ).toString('base64url');
    const noneToken = `${header}.${body}.`;

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${noneToken}` },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Missing jti claim
// ---------------------------------------------------------------------------

describe('verifyJWT — missing jti claim', () => {
  it('returns 401 with "Invalid token" when the JWT has no jti claim', async () => {
    app = await buildTestApp();
    // Old-style token issued before revocation support — no jti
    const token = jwt.sign(
      { userId: 'u-1', email: 'a@b.com' },
      TEST_SECRET,
      { expiresIn: '15m' }
    );

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid token');
  });

  it('does not call isAccessTokenRevoked when jti is absent', async () => {
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'u-1', email: 'a@b.com' },
      TEST_SECRET,
      { expiresIn: '15m' }
    );

    await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(mockIsRevoked).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Revoked token
// ---------------------------------------------------------------------------

describe('verifyJWT — revoked token', () => {
  it('returns 401 with "Token has been revoked" when jti is in the blocklist', async () => {
    mockIsRevoked.mockResolvedValue(true);
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'u-1', email: 'a@b.com', jti: 'logged-out-jti' },
      TEST_SECRET,
      { expiresIn: '15m' }
    );

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Token has been revoked');
  });

  it('calls isAccessTokenRevoked with the exact jti from the token', async () => {
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'u-1', email: 'a@b.com', jti: 'specific-jti-value' },
      TEST_SECRET,
      { expiresIn: '15m' }
    );

    await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(mockIsRevoked).toHaveBeenCalledWith('specific-jti-value');
  });

  it('calls isAccessTokenRevoked exactly once per request', async () => {
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'u-1', email: 'a@b.com', jti: 'jti-once' },
      TEST_SECRET,
      { expiresIn: '15m' }
    );

    await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(mockIsRevoked).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Happy path — valid, non-revoked token with jti
// ---------------------------------------------------------------------------

describe('verifyJWT — valid token', () => {
  it('calls next and attaches payload to request.user', async () => {
    app = await buildTestApp();
    const payload = {
      userId: 'u-abc',
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
      jti: 'jti-xyz',
    };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '15m' });

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userId).toBe('u-abc');
    expect(body.email).toBe('alice@example.com');
    expect(body.firstName).toBe('Alice');
    expect(body.lastName).toBe('Smith');
    expect(body.jti).toBe('jti-xyz');
  });

  it('attaches exp to request.user so the logout handler can read it', async () => {
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'u-abc', email: 'alice@example.com', jti: 'jti-exp-test' },
      TEST_SECRET,
      { expiresIn: '15m' }
    );

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().exp).toBeDefined();
    expect(typeof res.json().exp).toBe('number');
  });

  it('does not call isAccessTokenRevoked when the token is not in the blocklist', async () => {
    mockIsRevoked.mockResolvedValue(false);
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'u-abc', email: 'alice@example.com', jti: 'jti-valid' },
      TEST_SECRET,
      { expiresIn: '15m' }
    );

    await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    // isAccessTokenRevoked IS called — just returns false
    expect(mockIsRevoked).toHaveBeenCalledWith('jti-valid');
    expect(mockIsRevoked).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Session invalidation (password reset revocation)
// ---------------------------------------------------------------------------

describe('verifyJWT — session invalidation', () => {
  it('returns 401 with "Token has been revoked" when the user sessions were invalidated after the token was issued', async () => {
    mockIsSessionsInvalidated.mockResolvedValue(true);
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'u-reset', email: 'bob@example.com', jti: 'jti-stale' },
      TEST_SECRET,
      { expiresIn: '15m' }
    );

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Token has been revoked');
  });

  it('calls isSessionsInvalidatedForUser with the correct userId and iat', async () => {
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'u-check', email: 'carol@example.com', jti: 'jti-check' },
      TEST_SECRET,
      { expiresIn: '15m' }
    );

    await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(mockIsSessionsInvalidated).toHaveBeenCalledWith('u-check', expect.any(Number));
  });

  it('checks both JTI revocation and session invalidation in parallel on every request', async () => {
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'u-parallel', email: 'd@e.com', jti: 'jti-parallel' },
      TEST_SECRET,
      { expiresIn: '15m' }
    );

    await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(mockIsRevoked).toHaveBeenCalledTimes(1);
    expect(mockIsSessionsInvalidated).toHaveBeenCalledTimes(1);
  });

  it('allows the request when neither JTI revocation nor session invalidation triggers', async () => {
    mockIsRevoked.mockResolvedValue(false);
    mockIsSessionsInvalidated.mockResolvedValue(false);
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'u-ok', email: 'e@f.com', jti: 'jti-ok' },
      TEST_SECRET,
      { expiresIn: '15m' }
    );

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });
});