/**
 * @module auth.account.integration.test
 * @description Integration tests for account-deletion:
 *   DELETE /api/auth/account
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
// Email mock - prevents real sends during account deletion.
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
// DELETE /api/auth/account
// ---------------------------------------------------------------------------

describe('DELETE /api/auth/account', () => {
  let app: FastifyInstance;
  let testUser: Awaited<ReturnType<typeof createVerifiedUser>> | null = null;

  afterEach(async () => {
    await app?.close();
    if (testUser) {
      // deleteUser is a no-op if the record was already removed during the test
      await cleanupUser(testUser.id);
      testUser = null;
    }
  });

  it('removes the user record from the database', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const token = makeAccessToken(testUser.id, testUser.email);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/auth/account',
      cookies: { accessToken: token },
      payload: { currentPassword: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(200);

    const lookup = await authRepo.findUserById(testUser.id);
    expect(lookup).toBeNull();
    testUser = null; // already deleted - skip afterEach cleanup
  });

  it('deletes all refresh tokens from the database when the account is deleted', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: TEST_PASSWORD },
    });
    const { refreshToken } = extractTokenCookies(loginRes);
    const tokenId = refreshToken.split('.')[0];

    const token = makeAccessToken(testUser.id, testUser.email);
    await app.inject({
      method: 'DELETE',
      url: '/api/auth/account',
      cookies: { accessToken: token },
      payload: { currentPassword: TEST_PASSWORD },
    });

    const record = await authTokensRepo.findRefreshToken(tokenId);
    expect(record).toBeNull();
    testUser = null; // already deleted - skip afterEach cleanup
  });

  it('returns 401 when the current password is incorrect and does not delete the user', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const token = makeAccessToken(testUser.id, testUser.email);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/auth/account',
      cookies: { accessToken: token },
      payload: { currentPassword: 'WrongPassword1!' },
    });

    expect(res.statusCode).toBe(401);

    const stillExists = await authRepo.findUserById(testUser.id);
    expect(stillExists).not.toBeNull();
  });
});
