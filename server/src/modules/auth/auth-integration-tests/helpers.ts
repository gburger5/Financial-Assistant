/**
 * @module auth.integration.helpers
 * @description Shared constants and test-utility functions for the auth
 * integration test suite.
 * Imported by every auth integration test file - keep this file free of
 * vi.mock() calls and test-framework imports so it can be re-used cleanly.
 */
import type { FastifyInstance } from 'fastify';
import { hash } from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { buildApp } from '../../../app.js';
import * as authRepo from '../auth.repository.js';
import * as authTokensRepo from '../auth-tokens.repository.js';
import type { UserRecord } from '../auth.repository.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TEST_SECRET = 'integration-test-secret';

/** Satisfies password minLength (10) and complexity requirements. */
export const TEST_PASSWORD = 'IntegrationTest1!';
export const NEW_PASSWORD  = 'NewPassword2@long';

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

/**
 * Builds and readies the full Fastify application.
 * Uses the real buildApp() factory - all plugins, hooks, and routes are wired.
 * A fresh instance per test keeps rate-limit counters and plugin state isolated.
 *
 * @returns {Promise<FastifyInstance>}
 */
export async function buildTestApp(): Promise<FastifyInstance> {
  const app = buildApp();
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/**
 * Inserts a pre-verified user record directly into DynamoDB, bypassing the
 * registration + email-verification flow.
 * Use this as a test precondition when register/verify-email is not under test.
 *
 * @param {Partial<UserRecord>} overrides - Fields to override on the default fixture.
 * @returns {Promise<UserRecord>} The created user record as stored in the DB.
 */
export async function createVerifiedUser(overrides: Partial<UserRecord> = {}): Promise<UserRecord> {
  const now = new Date().toISOString();
  const user: UserRecord = {
    id: uuidv4(),
    firstName: 'Alice',
    lastName: 'Smith',
    email: `alice-${uuidv4()}@example.com`,
    password_hash: await hash(TEST_PASSWORD),
    emailVerified: true,
    emailVerificationToken: null,
    emailVerificationTokenExpires: null,
    pendingEmail: null,
    passwordResetToken: null,
    passwordResetTokenExpires: null,
    created_at: now,
    updated_at: now,
    failedLoginAttempts: 0,
    accountLockedUntil: null,
    plaidItems: [],
    onboarding: { plaidLinked: false, budgetAnalyzed: false, budgetConfirmed: false },
    ...overrides,
  };
  await authRepo.createUser(user);
  return user;
}

/**
 * Removes a user record and all associated auth tokens from DynamoDB.
 * Called in afterEach hooks to leave the test database clean.
 * Safe to call even if the user was already deleted (DynamoDB DeleteCommand
 * is a no-op on missing items).
 *
 * @param {string} userId - UUID of the user to remove.
 * @returns {Promise<void>}
 */
export async function cleanupUser(userId: string): Promise<void> {
  await Promise.all([
    authRepo.deleteUser(userId),
    authTokensRepo.deleteAllRefreshTokensForUser(userId),
  ]);
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/**
 * Mints a signed access token for the given user using TEST_SECRET.
 * Identical to the production issueAccessToken() but uses the test secret
 * so tests do not need JWT_SECRET set to a specific value.
 *
 * @param {string} userId - Subject of the token.
 * @param {string} email  - Email claim embedded in the token.
 * @param {string} [jti]  - JWT ID; a new UUID is generated if omitted.
 * @returns {string} Signed JWT.
 */
export function makeAccessToken(userId: string, email: string, jti: string = uuidv4()): string {
  return jwt.sign({ userId, email, jti }, TEST_SECRET, { expiresIn: '15m', algorithm: 'HS256' });
}
