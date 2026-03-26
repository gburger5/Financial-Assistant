/**
 * @module auth.service
 * @description Business logic for the auth module.
 * Imports from the repository (DynamoDB) and lib/errors.ts.
 * Never returns raw UserRecord data — all outbound data is shaped as PublicUser.
 */
import jwt from 'jsonwebtoken';
import { hash, verify } from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import * as repo from './auth.repository.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../lib/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @class PublicUser
 * @description Safe user representation returned to external callers.
 * Contains no sensitive fields (no password_hash, no plaidItems, etc.).
 */
export interface PublicUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  /** True once the user has accepted a budget agent proposal. Used by the
   * frontend to skip the onboarding agent step on subsequent logins. */
  agentBudgetApproved: boolean;
  /** ISO date string (YYYY-MM-DD). Set during onboarding, before budget creation. */
  birthday?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum consecutive failed login attempts before the account is locked. */
export const MAX_LOGIN_ATTEMPTS = 5;

/** Duration in minutes that an account stays locked after too many failures. */
export const LOCKOUT_DURATION_MINUTES = 15;

/**
 * Password must contain at least one uppercase letter, one lowercase letter,
 * and one digit. Validated here instead of in JSON Schema because AJV cannot
 * express cross-character-class constraints as a single pattern cleanly.
 */
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reads the JWT secret lazily so tests can set process.env.JWT_SECRET
 * before the first call without module-load-time evaluation.
 *
 * @returns {string} The HS256 signing secret.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  return secret ?? 'test-secret-key';
}

/**
 * Converts an internal UserRecord to a PublicUser by picking safe fields only.
 *
 * @param {repo.UserRecord} user
 * @returns {PublicUser}
 */
function toPublicUser(user: repo.UserRecord): PublicUser {
  return {
    userId: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    createdAt: user.created_at,
    agentBudgetApproved: (user.onboarding as Record<string, unknown>)?.agentBudgetApproved === true,
    birthday: user.birthday,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Validates that a password satisfies complexity requirements.
 * Throws instead of returning a boolean so callers can let the error bubble
 * to the global error handler without try/catch boilerplate.
 *
 * Complexity rule: at least one uppercase letter, one lowercase letter,
 * and one digit. Minimum length is enforced at the JSON Schema layer (10 chars).
 *
 * @param {string} password - The plaintext password to validate.
 * @throws {BadRequestError} If the password does not meet complexity requirements.
 */
export function validatePasswordComplexity(password: string): void {
  if (!PASSWORD_REGEX.test(password)) {
    throw new BadRequestError(
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    );
  }
}

/**
 * Registers a new user.
 * Normalises email, checks for duplicates, validates password complexity,
 * hashes the password with argon2id, persists the record, and returns a
 * PublicUser with all provided profile fields.
 *
 * @param {string} email - User-supplied email address (will be lowercased).
 * @param {string} password - Plaintext password (will be hashed, never stored).
 * @param {string} firstName - User's first name.
 * @param {string} lastName - User's last name.
 * @returns {Promise<PublicUser>}
 * @throws {ConflictError} If the email is already registered.
 * @throws {BadRequestError} If the password fails complexity rules.
 */
export async function registerUser(
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<PublicUser> {
  const normalizedEmail = email.toLowerCase();

  const existing = await repo.findUserByEmail(normalizedEmail);
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  validatePasswordComplexity(password);

  const password_hash = await hash(password);
  const now = new Date().toISOString();

  const newUser: repo.UserRecord = {
    id: uuidv4(),
    firstName,
    lastName,
    email: normalizedEmail,
    password_hash,
    created_at: now,
    updated_at: now,
    failedLoginAttempts: 0,
    accountLockedUntil: null,
    plaidItems: [],
    onboarding: {
      plaidLinked: false,
      budgetAnalyzed: false,
      budgetConfirmed: false,
    },
  };

  await repo.createUser(newUser);
  return toPublicUser(newUser);
}

/**
 * Authenticates a user and returns a short-lived JWT.
 *
 * Security notes:
 * - Email is normalised before lookup.
 * - When the email is not found, a dummy argon2.verify call is still made so
 *   timing is indistinguishable from a real compare (prevents user enumeration).
 * - Lockout is checked before password comparison to avoid unnecessary work.
 * - On a wrong password the failure counter is incremented; at MAX_LOGIN_ATTEMPTS
 *   the account is locked for LOCKOUT_DURATION_MINUTES.
 * - On success the counter is reset before the token is issued.
 * - The JWT contains only { userId, email } — no PII beyond what is needed.
 *
 * @param {string} email - User-supplied email (will be lowercased).
 * @param {string} password - Plaintext password to compare against the stored hash.
 * @returns {Promise<{ user: PublicUser; token: string }>}
 * @throws {UnauthorizedError} When credentials are invalid.
 * @throws {BadRequestError} When the account is locked.
 */
export async function loginUser(
  email: string,
  password: string
): Promise<{ user: PublicUser; token: string }> {
  const normalizedEmail = email.toLowerCase();

  const user = await repo.findUserByEmail(normalizedEmail);

  if (!user) {
    // Perform a dummy compare so the response time is the same whether the
    // email exists or not, preventing user-enumeration via timing.
    // The hash is a valid argon2id hash of an arbitrary string; the compare
    // will always fail and the result is intentionally discarded.
    await verify(
      '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$iWh06vD8Fx27wf9NPTi5jv8V4VkY/ZgWcWXKTcnq82o',
      password
    ).catch(() => {});
    throw new UnauthorizedError('Invalid email or password');
  }

  // Check lockout before comparing password to avoid unnecessary argon2 work.
  if (user.accountLockedUntil) {
    const lockEnd = new Date(user.accountLockedUntil);
    if (new Date() < lockEnd) {
      const minutesLeft = Math.ceil((lockEnd.getTime() - Date.now()) / 60_000);
      throw new BadRequestError(`Account locked. Try again in ${minutesLeft} minutes.`);
    }
    // Lockout period expired — reset state before continuing.
    await repo.resetLockout(user.id);
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;
  }

  const isValid = await verify(user.password_hash, password);

  if (!isValid) {
    const newFailures = user.failedLoginAttempts + 1;
    const lockedUntil =
      newFailures >= MAX_LOGIN_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60_000).toISOString()
        : null;

    await repo.updateLoginFailure(user.id, newFailures, lockedUntil);

    // If this failure just crossed the threshold, report the lockout immediately
    // rather than making the caller do one more attempt to discover it.
    if (lockedUntil !== null) {
      throw new BadRequestError(`Account locked. Try again in ${LOCKOUT_DURATION_MINUTES} minutes.`);
    }
    throw new UnauthorizedError('Invalid email or password');
  }

  await repo.resetLockout(user.id);

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    getJwtSecret(),
    { expiresIn: '15m', algorithm: 'HS256' }
  );

  return { user: toPublicUser(user), token };
}

/**
 * Retrieves a user by their ID and returns a PublicUser.
 * Used by the /verify endpoint (and any other route needing fresh user data)
 * after the JWT has already been verified by the auth middleware.
 *
 * @param {string} userId - UUID of the user to retrieve.
 * @returns {Promise<PublicUser>}
 * @throws {NotFoundError} If no user with that ID exists.
 */
export async function getUserById(userId: string): Promise<PublicUser> {
  const user = await repo.findUserById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return toPublicUser(user);
}

/**
 * Updates a user's birthday.
 * Persists the change to DynamoDB and returns the updated PublicUser.
 *
 * @param {string} userId - UUID of the user to update.
 * @param {string} birthday - ISO date string (YYYY-MM-DD).
 * @returns {Promise<PublicUser>}
 * @throws {NotFoundError} If no user with that ID exists.
 */
export async function updateBirthday(userId: string, birthday: string): Promise<PublicUser> {
  const user = await repo.findUserById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  await repo.updateUserBirthday(userId, birthday);
  user.birthday = birthday;
  return toPublicUser(user);
}
