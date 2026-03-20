/**
 * @module auth.registration.integration.test
 * @description Integration tests for the registration and email-verification routes:
 *   POST   /api/auth/register
 *   GET    /api/auth/verify-email
 *   POST   /api/auth/resend-verification
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
import {
  TEST_PASSWORD,
  buildTestApp,
  createVerifiedUser,
  cleanupUser,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Email mock
// Intercepts all outbound emails and captures the raw tokens so integration
// tests can drive the verify-email flow without a real inbox.
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
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

describe('POST /api/auth/register', () => {
  let app: FastifyInstance;
  let createdUserId: string | null = null;

  afterEach(async () => {
    await app?.close();
    if (createdUserId) {
      await cleanupUser(createdUserId);
      createdUserId = null;
    }
  });

  it('creates a user record in the database with the supplied profile fields', async () => {
    app = await buildTestApp();
    const email = `reg-fields-${uuidv4()}@example.com`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { firstName: 'Bob', lastName: 'Jones', email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(201);
    createdUserId = res.json().userId;

    const stored = await authRepo.findUserByEmail(email);
    expect(stored).not.toBeNull();
    expect(stored!.firstName).toBe('Bob');
    expect(stored!.lastName).toBe('Jones');
    expect(stored!.email).toBe(email);
  });

  it('stores the password as an argon2 hash, never as plaintext', async () => {
    app = await buildTestApp();
    const email = `reg-hash-${uuidv4()}@example.com`;

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { firstName: 'Bob', lastName: 'Jones', email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD },
    });

    const stored = await authRepo.findUserByEmail(email);
    createdUserId = stored!.id;

    expect(stored!.password_hash).not.toBe(TEST_PASSWORD);
    expect(stored!.password_hash).toMatch(/^\$argon2/);
  });

  it('stores emailVerified=false immediately after registration', async () => {
    app = await buildTestApp();
    const email = `reg-unverified-${uuidv4()}@example.com`;

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { firstName: 'Bob', lastName: 'Jones', email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD },
    });

    const stored = await authRepo.findUserByEmail(email);
    createdUserId = stored!.id;

    expect(stored!.emailVerified).toBe(false);
  });

  it('stores an email verification token and future expiry in the database', async () => {
    app = await buildTestApp();
    const email = `reg-token-${uuidv4()}@example.com`;

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { firstName: 'Bob', lastName: 'Jones', email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD },
    });

    const stored = await authRepo.findUserByEmail(email);
    createdUserId = stored!.id;

    expect(stored!.emailVerificationToken).toBeTruthy();
    expect(stored!.emailVerificationTokenExpires).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('sends a verification email with a raw token during registration', async () => {
    app = await buildTestApp();
    const email = `reg-email-${uuidv4()}@example.com`;

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { firstName: 'Bob', lastName: 'Jones', email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD },
    });

    const stored = await authRepo.findUserByEmail(email);
    createdUserId = stored!.id;

    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].type).toBe('verification');
    expect(capturedEmails[0].to).toBe(email);
    expect(capturedEmails[0].token).toBeTruthy();
  });

  it('returns 409 when the email is already registered and verified', async () => {
    app = await buildTestApp();
    const existing = await createVerifiedUser();
    createdUserId = existing.id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { firstName: 'Bob', lastName: 'Jones', email: existing.email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(409);
  });

  it('generates a new verification token when re-registering an unverified email', async () => {
    app = await buildTestApp();
    const email = `rereg-${uuidv4()}@example.com`;

    // First registration
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { firstName: 'Bob', lastName: 'Jones', email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD },
    });

    const storedFirst = await authRepo.findUserByEmail(email);
    createdUserId = storedFirst!.id;
    const firstToken = storedFirst!.emailVerificationToken;

    capturedEmails.length = 0;

    // Re-register same unverified email
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { firstName: 'Bob', lastName: 'Jones', email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD },
    });

    const storedSecond = await authRepo.findUserByEmail(email);
    expect(storedSecond!.emailVerificationToken).not.toBe(firstToken);
    expect(capturedEmails).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/verify-email
// ---------------------------------------------------------------------------

describe('GET /api/auth/verify-email', () => {
  let app: FastifyInstance;
  let testUser: Awaited<ReturnType<typeof createVerifiedUser>> | null = null;

  afterEach(async () => {
    await app?.close();
    if (testUser) {
      await cleanupUser(testUser.id);
      testUser = null;
    }
  });

  it('sets emailVerified=true in the database when given a valid token', async () => {
    app = await buildTestApp();
    const email = `verify-${uuidv4()}@example.com`;

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { firstName: 'Carol', lastName: 'White', email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD },
    });

    testUser = await authRepo.findUserByEmail(email);
    const rawToken = capturedEmails.find(e => e.type === 'verification')!.token!;

    const res = await app.inject({
      method: 'GET',
      url: `/api/auth/verify-email?token=${rawToken}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const updated = await authRepo.findUserById(testUser!.id);
    expect(updated!.emailVerified).toBe(true);
  });

  it('clears the verification token from the database after a successful verification', async () => {
    app = await buildTestApp();
    const email = `verify-clear-${uuidv4()}@example.com`;

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { firstName: 'Carol', lastName: 'White', email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD },
    });

    testUser = await authRepo.findUserByEmail(email);
    const rawToken = capturedEmails.find(e => e.type === 'verification')!.token!;

    await app.inject({
      method: 'GET',
      url: `/api/auth/verify-email?token=${rawToken}`,
    });

    const updated = await authRepo.findUserById(testUser!.id);
    // DynamoDB REMOVE leaves the attribute absent (undefined), not null
    expect(updated!.emailVerificationToken).toBeFalsy();
    expect(updated!.emailVerificationTokenExpires).toBeFalsy();
  });

  it('returns 400 when the token does not match any record in the database', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/verify-email?token=completely-invalid-token-no-match',
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when the token query parameter is missing', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/verify-email',
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when the verification token has expired', async () => {
    app = await buildTestApp();
    const email = `expired-verify-${uuidv4()}@example.com`;

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { firstName: 'Eve', lastName: 'Expired', email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD },
    });

    testUser = await authRepo.findUserByEmail(email);
    const rawToken = capturedEmails.find(e => e.type === 'verification')!.token!;

    // Backdate the expiry - the stored field is the hash, which stays valid;
    // only the expiry timestamp is changed to 1 second in the past.
    await authRepo.updateVerificationToken(
      testUser!.id,
      testUser!.emailVerificationToken!,
      Math.floor(Date.now() / 1000) - 1,
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/auth/verify-email?token=${rawToken}`,
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/resend-verification
// ---------------------------------------------------------------------------

describe('POST /api/auth/resend-verification', () => {
  let app: FastifyInstance;
  let testUser: Awaited<ReturnType<typeof createVerifiedUser>> | null = null;

  afterEach(async () => {
    await app?.close();
    if (testUser) {
      await cleanupUser(testUser.id);
      testUser = null;
    }
  });

  it('replaces the verification token in the database with a new one', async () => {
    app = await buildTestApp();
    const email = `resend-${uuidv4()}@example.com`;

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { firstName: 'Dave', lastName: 'Black', email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD },
    });

    testUser = await authRepo.findUserByEmail(email);
    const originalToken = testUser!.emailVerificationToken;
    capturedEmails.length = 0;

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/resend-verification',
      payload: { email },
    });

    expect(res.statusCode).toBe(200);

    const updated = await authRepo.findUserById(testUser!.id);
    expect(updated!.emailVerificationToken).not.toBe(originalToken);
    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].type).toBe('verification');
  });

  it('returns 200 and sends no email when the email is not registered (anti-enumeration)', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/resend-verification',
      payload: { email: `nobody-${uuidv4()}@example.com` },
    });

    expect(res.statusCode).toBe(200);
    expect(capturedEmails).toHaveLength(0);
  });

  it('returns 200 and sends no email when the user is already verified (anti-enumeration)', async () => {
    app = await buildTestApp();
    testUser = await createVerifiedUser();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/resend-verification',
      payload: { email: testUser.email },
    });

    expect(res.statusCode).toBe(200);
    expect(capturedEmails).toHaveLength(0);
  });
});
