/**
 * @module auth.profile.integration.test
 * @description Integration tests for profile-update routes:
 *   PATCH /api/auth/profile/name
 *   PATCH /api/auth/profile/password
 *   PATCH /api/auth/profile/email
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
  makeAccessToken,
  extractTokenCookies,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Email mock
// Intercepts verification emails sent during the profile/email flow so tests
// can drive the confirm-new-email step without a real inbox.
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
// PATCH /api/auth/profile/name
// ---------------------------------------------------------------------------

describe('PATCH /api/auth/profile/name', () => {
  let app: FastifyInstance;
  let testUser: Awaited<ReturnType<typeof createVerifiedUser>> | null = null;

  afterEach(async () => {
    await app?.close();
    if (testUser) {
      await cleanupUser(testUser.id);
      testUser = null;
    }
  });

  it('updates firstName and lastName in the database', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const token = makeAccessToken(testUser.id, testUser.email);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile/name',
      cookies: { accessToken: token },
      payload: { firstName: 'UpdatedFirst', lastName: 'UpdatedLast' },
    });

    expect(res.statusCode).toBe(200);

    const updated = await authRepo.findUserById(testUser.id);
    expect(updated!.firstName).toBe('UpdatedFirst');
    expect(updated!.lastName).toBe('UpdatedLast');
  });

  it('returns the updated user object in the response body', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const token = makeAccessToken(testUser.id, testUser.email);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile/name',
      cookies: { accessToken: token },
      payload: { firstName: 'NewFirst', lastName: 'NewLast' },
    });

    expect(res.json().firstName).toBe('NewFirst');
    expect(res.json().lastName).toBe('NewLast');
    expect(res.json().userId).toBe(testUser.id);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/auth/profile/password
// ---------------------------------------------------------------------------

describe('PATCH /api/auth/profile/password', () => {
  let app: FastifyInstance;
  let testUser: Awaited<ReturnType<typeof createVerifiedUser>> | null = null;

  afterEach(async () => {
    await app?.close();
    if (testUser) {
      await cleanupUser(testUser.id);
      testUser = null;
    }
  });

  it('replaces the password hash in the database after a successful change', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const originalHash = testUser.password_hash;
    const token = makeAccessToken(testUser.id, testUser.email);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile/password',
      cookies: { accessToken: token },
      payload: { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD },
    });

    expect(res.statusCode).toBe(200);

    const updated = await authRepo.findUserById(testUser.id);
    expect(updated!.password_hash).not.toBe(originalHash);
    expect(updated!.password_hash).toMatch(/^\$argon2/);
  });

  it('deletes all refresh tokens from the database after a password change', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUser.email, password: TEST_PASSWORD },
    });
    const { refreshToken } = extractTokenCookies(loginRes);
    const tokenId = refreshToken.split('.')[0];

    const beforeChange = await authTokensRepo.findRefreshToken(tokenId);
    expect(beforeChange).not.toBeNull();

    const token = makeAccessToken(testUser.id, testUser.email);
    await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile/password',
      cookies: { accessToken: token },
      payload: { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD },
    });

    const afterChange = await authTokensRepo.findRefreshToken(tokenId);
    expect(afterChange).toBeNull();
  });

  it('returns 401 when the current password is incorrect and does not change the hash', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const originalHash = testUser.password_hash;
    const token = makeAccessToken(testUser.id, testUser.email);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile/password',
      cookies: { accessToken: token },
      payload: { currentPassword: 'WrongCurrent1!', newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD },
    });

    expect(res.statusCode).toBe(401);

    const unchanged = await authRepo.findUserById(testUser.id);
    expect(unchanged!.password_hash).toBe(originalHash);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/auth/profile/email
// ---------------------------------------------------------------------------

describe('PATCH /api/auth/profile/email', () => {
  let app: FastifyInstance;
  let testUser: Awaited<ReturnType<typeof createVerifiedUser>> | null = null;
  let secondUserId: string | null = null;

  afterEach(async () => {
    await app?.close();
    if (testUser) {
      await cleanupUser(testUser.id);
      testUser = null;
    }
    if (secondUserId) {
      await cleanupUser(secondUserId);
      secondUserId = null;
    }
  });

  it('stores the new address as pendingEmail in the database', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const token = makeAccessToken(testUser.id, testUser.email);
    const newEmail = `new-${uuidv4()}@example.com`;

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile/email',
      cookies: { accessToken: token },
      payload: { newEmail, currentPassword: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(200);

    const updated = await authRepo.findUserById(testUser.id);
    expect(updated!.pendingEmail).toBe(newEmail);
  });

  it('stores a new verification token in the database for the pending address', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const token = makeAccessToken(testUser.id, testUser.email);
    const newEmail = `pending-token-${uuidv4()}@example.com`;

    await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile/email',
      cookies: { accessToken: token },
      payload: { newEmail, currentPassword: TEST_PASSWORD },
    });

    const updated = await authRepo.findUserById(testUser.id);
    expect(updated!.emailVerificationToken).toBeTruthy();
    expect(updated!.emailVerificationTokenExpires).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('swaps email to pendingEmail and clears pending state after verify-email', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const token = makeAccessToken(testUser.id, testUser.email);
    const newEmail = `apply-${uuidv4()}@example.com`;

    await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile/email',
      cookies: { accessToken: token },
      payload: { newEmail, currentPassword: TEST_PASSWORD },
    });

    const rawToken = capturedEmails.find(e => e.type === 'verification')!.token!;

    await app.inject({
      method: 'GET',
      url: `/api/auth/verify-email?token=${rawToken}`,
    });

    const updated = await authRepo.findUserById(testUser.id);
    expect(updated!.email).toBe(newEmail);
    // DynamoDB REMOVE leaves pendingEmail absent (undefined), not null
    expect(updated!.pendingEmail).toBeFalsy();
  });

  it('returns 409 when the requested new email is already registered', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const second = await createVerifiedUser();
    secondUserId = second.id;
    const token = makeAccessToken(testUser.id, testUser.email);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile/email',
      cookies: { accessToken: token },
      payload: { newEmail: second.email, currentPassword: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 401 when the current password is incorrect', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();
    const token = makeAccessToken(testUser.id, testUser.email);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile/email',
      cookies: { accessToken: token },
      payload: { newEmail: `new-${uuidv4()}@example.com`, currentPassword: 'WrongPassword1!' },
    });

    expect(res.statusCode).toBe(401);
  });
});
