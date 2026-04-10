/**
 * @module auth.password-reset.integration.test
 * @description Integration tests for the password-reset flow:
 *   POST /api/auth/forgot-password
 *   POST /api/auth/reset-password
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
import * as authRepo from '../auth.repository.js';
import * as authTokensRepo from '../auth-tokens.repository.js';
import {
  TEST_SECRET,
  TEST_PASSWORD,
  NEW_PASSWORD,
  buildTestApp,
  createVerifiedUser,
  cleanupUser,
  extractTokenCookies,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Email mock
// Intercepts reset emails so tests can retrieve the raw token that the service
// would have emailed, allowing the full forgot/reset flow to run end-to-end.
// ---------------------------------------------------------------------------

/**
 * Accumulates every "email" that the service would have sent during a test.
 * Reset in beforeEach so each test starts with an empty inbox.
 */
const capturedEmails: Array<{ to: string; token?: string; type: string }> = [];

vi.mock('../../../lib/email.js', () => ({
  sendVerificationEmail: vi.fn(async (to: string, token: string) => {
    capturedEmails.push({ to, token, type: 'verification' });
  }),
  sendPasswordResetEmail: vi.fn(async (to: string, token: string) => {
    capturedEmails.push({ to, token, type: 'reset' });
  }),
  sendPasswordChangedEmail: vi.fn(async (to: string) => {
    capturedEmails.push({ to, type: 'changed' });
  }),
  sendAccountDeletedEmail: vi.fn(async (to: string) => {
    capturedEmails.push({ to, type: 'deleted' });
  }),
}));

// ---------------------------------------------------------------------------
// Global setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedEmails.length = 0;
  process.env.JWT_SECRET = TEST_SECRET;
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------

describe('POST /api/auth/forgot-password', () => {
  let app: FastifyInstance;
  let testUser: Awaited<ReturnType<typeof createVerifiedUser>> | null = null;

  afterEach(async () => {
    await app?.close();
    if (testUser) {
      await cleanupUser(testUser.id);
      testUser = null;
    }
  });

  it('stores a password reset token hash and expiry in the database for a verified user', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: testUser.email },
    });

    expect(res.statusCode).toBe(200);

    const updated = await authRepo.findUserById(testUser.id);
    expect(updated!.passwordResetToken).toBeTruthy();
    expect(updated!.passwordResetTokenExpires).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('sends a password reset email containing the raw token', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: testUser.email },
    });

    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].type).toBe('reset');
    expect(capturedEmails[0].to).toBe(testUser.email);
    expect(capturedEmails[0].token).toBeTruthy();
  });

  it('returns 200 and stores no token for an unregistered email (anti-enumeration)', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: `nobody-${uuidv4()}@example.com` },
    });

    expect(res.statusCode).toBe(200);
    expect(capturedEmails).toHaveLength(0);
  });

  it('returns 200 and stores no token for an unverified account (anti-enumeration)', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser({ emailVerified: false });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: testUser.email },
    });

    expect(res.statusCode).toBe(200);
    expect(capturedEmails).toHaveLength(0);

    const unchanged = await authRepo.findUserById(testUser.id);
    expect(unchanged!.passwordResetToken).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------

describe('POST /api/auth/reset-password', () => {
  let app: FastifyInstance;
  let testUser: Awaited<ReturnType<typeof createVerifiedUser>> | null = null;

  afterEach(async () => {
    await app?.close();
    if (testUser) {
      await cleanupUser(testUser.id);
      testUser = null;
    }
  });

  it('replaces the password hash and clears the reset token in the database', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const originalHash = testUser.password_hash;

    await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: testUser.email },
    });
    const rawToken = capturedEmails.find(e => e.type === 'reset')!.token!;

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: rawToken, newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD },
    });

    expect(res.statusCode).toBe(200);

    const updated = await authRepo.findUserById(testUser.id);
    expect(updated!.password_hash).not.toBe(originalHash);
    // DynamoDB REMOVE leaves these absent (undefined), not null
    expect(updated!.passwordResetToken).toBeFalsy();
    expect(updated!.passwordResetTokenExpires).toBeFalsy();
  });

  it('deletes all refresh tokens after a password reset', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: TEST_PASSWORD },
    });
    const { refreshToken } = extractTokenCookies(loginRes);
    const tokenId = refreshToken.split('.')[0];

    capturedEmails.length = 0;
    await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: testUser.email },
    });
    const rawToken = capturedEmails.find(e => e.type === 'reset')!.token!;

    await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: rawToken, newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD },
    });

    const record = await authTokensRepo.findRefreshToken(tokenId);
    expect(record).toBeNull();
  });

  it('returns 400 when the reset token is invalid', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: 'completely-fake-token', newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 on a second use of the same token (single-use enforcement)', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: testUser.email },
    });
    const rawToken = capturedEmails.find(e => e.type === 'reset')!.token!;

    // First use succeeds
    await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: rawToken, newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD },
    });

    // Second use of the same token must be rejected
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: rawToken, newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD },
    });

    expect(res.statusCode).toBe(400);
  });
});
