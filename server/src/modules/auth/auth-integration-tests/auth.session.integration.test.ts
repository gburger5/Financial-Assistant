/**
 * @module auth.session.integration.test
 * @description Integration tests for session-management routes:
 *   POST /api/auth/login
 *   GET  /api/auth/verify
 *   POST /api/auth/logout
 *   POST /api/auth/refresh
 *
 * Uses fastify.inject() on the full buildApp() instance so every layer is
 * exercised: HTTP -> route plugin -> controller -> service -> DynamoDB.
 * Each test asserts on real database state rather than trusting only the HTTP
 * response.
 *
 * Prerequisites:
 *   - DynamoDB Local must be reachable at DYNAMODB_ENDPOINT (set in .env).
 *   - All tables and GSIs defined in db/tables.ts must exist.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import * as authRepo from '../auth.repository.js';
import * as authTokensRepo from '../auth-tokens.repository.js';
import {
  TEST_SECRET,
  TEST_PASSWORD,
  buildTestApp,
  createVerifiedUser,
  cleanupUser,
  makeAccessToken,
  extractTokenCookies,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Email mock - prevents real sends; no token capture needed for session tests.
// ---------------------------------------------------------------------------

vi.mock('../../../lib/email.js', () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendPasswordChangedEmail: vi.fn(),
  sendAccountDeletedEmail: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Global setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

// ---------------------------------------------------------------------------
// Authentication middleware - protected routes without a token
// ---------------------------------------------------------------------------

describe('authentication middleware', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  const protectedRoutes = [
    { method: 'GET'    as const, url: '/api/auth/verify' },
    { method: 'POST'   as const, url: '/api/auth/logout' },
    { method: 'PATCH'  as const, url: '/api/auth/profile/name',     payload: { firstName: 'A', lastName: 'B' } },
    { method: 'PATCH'  as const, url: '/api/auth/profile/password', payload: { currentPassword: 'OldPassword1!', newPassword: 'NewPassword1!', confirmNewPassword: 'NewPassword1!' } },
    { method: 'PATCH'  as const, url: '/api/auth/profile/email',    payload: { newEmail: 'a@b.com', currentPassword: 'OldPassword1!' } },
    { method: 'DELETE' as const, url: '/api/auth/account',          payload: { currentPassword: 'OldPassword1!' } },
  ];

  it.each(protectedRoutes)(
    'returns 401 with no accessToken cookie on $method $url',
    async ({ method, url, payload }) => {
      app = await buildTestApp();

      const res = await app.inject({ method, url, payload });

      expect(res.statusCode).toBe(401);
    },
  );
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe('POST /api/auth/login', () => {
  let app: FastifyInstance;
  let testUser: Awaited<ReturnType<typeof createVerifiedUser>> | null = null;

  afterEach(async () => {
    await app?.close();
    if (testUser) {
      await cleanupUser(testUser.id);
      testUser = null;
    }
  });

  it('creates a refresh token record in the database on a successful login', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(200);

    const { refreshToken } = extractTokenCookies(res);
    const tokenId = refreshToken.split('.')[0];

    const record = await authTokensRepo.findRefreshToken(tokenId);
    expect(record).not.toBeNull();
    expect(record!.userId).toBe(testUser.id);
  });

  it('increments failedLoginAttempts in the database on a wrong password', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: 'WrongPassword1!' },
    });

    const updated = await authRepo.findUserById(testUser.id);
    expect(updated!.failedLoginAttempts).toBe(1);
  });

  it('sets accountLockedUntil in the database after 5 consecutive failed attempts', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: testUser.email, password: 'WrongPassword1!' },
      });
    }

    const updated = await authRepo.findUserById(testUser.id);
    expect(updated!.accountLockedUntil).toBeTruthy();
  });

  it('resets failedLoginAttempts to 0 in the database on a successful login', async () => {
    app = await buildTestApp();
    // Seed 3 prior failures so reset is observable
    testUser = await createVerifiedUser({ failedLoginAttempts: 3 });

    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: TEST_PASSWORD },
    });

    const updated = await authRepo.findUserById(testUser.id);
    expect(updated!.failedLoginAttempts).toBe(0);
  });

  it('returns 401 when the user has not verified their email', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser({ emailVerified: false });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when the password is wrong without revealing which field was wrong', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: 'WrongPassword1!' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid email or password');
  });

  it('returns 400 and blocks login while the account is locked', async () => {
    app = await buildTestApp();
    // Seed a user that is already locked - skips the 5-attempt loop.
    testUser = await createVerifiedUser({
      failedLoginAttempts: 5,
      accountLockedUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Account locked/);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/verify
// ---------------------------------------------------------------------------

describe('GET /api/auth/verify', () => {
  let app: FastifyInstance;
  let testUser: Awaited<ReturnType<typeof createVerifiedUser>> | null = null;

  afterEach(async () => {
    await app?.close();
    if (testUser) {
      await cleanupUser(testUser.id);
      testUser = null;
    }
  });

  it('returns the current user data read from the database', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const token = makeAccessToken(testUser.id, testUser.email);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/verify',
      cookies: { accessToken: token },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userId).toBe(testUser.id);
    expect(body.email).toBe(testUser.email);
    expect(body.firstName).toBe(testUser.firstName);
    expect(body.lastName).toBe(testUser.lastName);
  });

  it('does not include sensitive fields in the response (password_hash, plaidItems)', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const token = makeAccessToken(testUser.id, testUser.email);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/verify',
      cookies: { accessToken: token },
    });

    expect(res.json()).not.toHaveProperty('password_hash');
    expect(res.json()).not.toHaveProperty('plaidItems');
  });

  it('returns 401 when the access token has been manually revoked in the database', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const jti = uuidv4();
    const token = makeAccessToken(testUser.id, testUser.email, jti);
    const decoded = jwt.decode(token) as { exp: number };

    await authTokensRepo.revokeAccessToken(jti, testUser.id, decoded.exp);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/verify',
      cookies: { accessToken: token },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe('POST /api/auth/logout', () => {
  let app: FastifyInstance;
  let testUser: Awaited<ReturnType<typeof createVerifiedUser>> | null = null;

  afterEach(async () => {
    await app?.close();
    if (testUser) {
      await cleanupUser(testUser.id);
      testUser = null;
    }
  });

  it('deletes the refresh token from the database on logout', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: TEST_PASSWORD },
    });
    const { accessToken, refreshToken } = extractTokenCookies(loginRes);
    const tokenId = refreshToken.split('.')[0];

    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { accessToken, refreshToken },
    });

    const record = await authTokensRepo.findRefreshToken(tokenId);
    expect(record).toBeNull();
  });

  it('writes a revocation record for the access token into the database', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const jti = uuidv4();
    const accessToken = makeAccessToken(testUser.id, testUser.email, jti);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: TEST_PASSWORD },
    });
    const { refreshToken } = extractTokenCookies(loginRes);

    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { accessToken, refreshToken },
    });

    const isRevoked = await authTokensRepo.isAccessTokenRevoked(jti);
    expect(isRevoked).toBe(true);
  });

  it('rejects subsequent requests that use the access token after logout', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const jti = uuidv4();
    const accessToken = makeAccessToken(testUser.id, testUser.email, jti);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: TEST_PASSWORD },
    });
    const { refreshToken } = extractTokenCookies(loginRes);

    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { accessToken, refreshToken },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/verify',
      cookies: { accessToken },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------

describe('POST /api/auth/refresh', () => {
  let app: FastifyInstance;
  let testUser: Awaited<ReturnType<typeof createVerifiedUser>> | null = null;

  afterEach(async () => {
    await app?.close();
    if (testUser) {
      await cleanupUser(testUser.id);
      testUser = null;
    }
  });

  it('deletes the old refresh token and creates a new one (rotation)', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: TEST_PASSWORD },
    });
    const { refreshToken: oldRefreshToken } = extractTokenCookies(loginRes);
    const oldTokenId = oldRefreshToken.split('.')[0];

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refreshToken: oldRefreshToken },
    });

    expect(refreshRes.statusCode).toBe(200);
    const { refreshToken: newRefreshToken } = extractTokenCookies(refreshRes);
    const newTokenId = newRefreshToken.split('.')[0];

    const oldRecord = await authTokensRepo.findRefreshToken(oldTokenId);
    expect(oldRecord).toBeNull();

    const newRecord = await authTokensRepo.findRefreshToken(newTokenId);
    expect(newRecord).not.toBeNull();
    expect(newRecord!.userId).toBe(testUser.id);
  });

  it('rejects a refresh token that has already been consumed (prevents replay)', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: TEST_PASSWORD },
    });
    const { refreshToken: oldRefreshToken } = extractTokenCookies(loginRes);

    // First use - rotates the token
    await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refreshToken: oldRefreshToken },
    });

    // Second use of the consumed token must be rejected
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refreshToken: oldRefreshToken },
    });

    expect(res.statusCode).toBe(401);
  });

  it('issues a valid new access token that can be used on protected routes', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: TEST_PASSWORD },
    });
    const { refreshToken } = extractTokenCookies(loginRes);

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refreshToken },
    });

    const { accessToken: newAccessToken } = extractTokenCookies(refreshRes);

    const verifyRes = await app.inject({
      method: 'GET',
      url: '/api/auth/verify',
      cookies: { accessToken: newAccessToken },
    });

    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().userId).toBe(testUser.id);
  });
});
