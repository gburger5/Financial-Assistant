/**
 * @module auth.service
 * @description Business logic for the auth module.
 * Imports from the repository (DynamoDB) and lib/errors.ts.
 * Never returns raw UserRecord data — all outbound data is shaped as PublicUser.
 */
import jwt from 'jsonwebtoken';
import { hash, verify } from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import * as repo from './auth.repository.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendAccountDeletedEmail,
} from '../../lib/email.js';
import * as authTokensRepo from './auth-tokens.repository.js';
import { deleteAllBudgetsForUser } from '../budget/budget.repository.js';
import { deleteAllItemsForUser } from '../items/items.repository.js';
import { deleteAllAccountsForUser } from '../accounts/accounts.repository.js';
import { deleteAllTransactionsForUser } from '../transactions/transactions.repository.js';
import { deleteAllLiabilitiesForUser } from '../liabilities/liabilities.repository.js';
import { deleteAllInvestmentDataForUser } from '../investments/investments.repository.js';
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
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9])/;

/** Lifetime of a refresh token in days. */
export const REFRESH_TOKEN_TTL_DAYS = 30;

/** Lifetime of a password-reset token in minutes. */
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60;

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
  if (!secret && process.env.NODE_ENV !== 'development') {
    // Fail loudly outside of local dev so staging/production never sign tokens
    // with the well-known fallback value 'test-secret-key'.
    throw new Error('JWT_SECRET environment variable is required');
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
  };
}

/**
 * Generates a cryptographically-random opaque token and its SHA-256 hash.
 * Pattern is identical to generateVerificationToken() in auth.service.ts;
 * extracted here to keep the additions self-contained before merging.
 *
 * @param {number} ttlSeconds - Seconds from now until the token expires.
 * @returns {{ rawToken: string; tokenHash: string; expiresAt: number }}
 */
function generateOpaqueToken(ttlSeconds: number): {
  rawToken: string;
  tokenHash: string;
  expiresAt: number;
} {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  return { rawToken, tokenHash, expiresAt };
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
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
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
    if (existing.emailVerified) {
      throw new ConflictError('Email already registered');
    }

    // regenerate token for unverified user
    const { rawToken, tokenHash, expires } = generateVerificationToken();

    await repo.updateVerificationToken(
      existing.id,
      tokenHash,
      expires
    );

    await sendVerificationEmail(existing.email, rawToken);

    return toPublicUser(existing);
  }

  validatePasswordComplexity(password);

  const password_hash = await hash(password);
  // Generate verification token
  const { rawToken, tokenHash, expires: verificationExpiry } = generateVerificationToken();
  const now = new Date().toISOString();

  const newUser: repo.UserRecord = {
    id: uuidv4(),
    firstName,
    lastName,
    email: normalizedEmail,
    password_hash,
    emailVerified: false,
    emailVerificationToken: tokenHash,
    emailVerificationTokenExpires: verificationExpiry,
    pendingEmail: null,
    passwordResetToken: null,
    passwordResetTokenExpires: null,
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
  await sendVerificationEmail(normalizedEmail, rawToken);
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
): Promise<{ user: PublicUser; token: string; refreshToken: string }> {
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

  if (!user.emailVerified) {
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

  const token = issueAccessToken(user.id, user.email);
  const refreshToken = await issueRefreshToken(user.id);

  return { user: toPublicUser(user), token, refreshToken };
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
 * Verifies a user's email address using a verification token.
 * The token is a random string that was emailed to the user; the hash of the
 * token is stored in the database. This function hashes the provided token and
 * looks up the user by the hash. If a user is found and the token is not expired,
 * their emailVerified flag is set to true.
 *
 * @param {string} token - The verification token.
 * @returns {Promise<void>}
 * @throws {BadRequestError} If the token is invalid or expired.
 */
export async function verifyEmail(token: string): Promise<void> {
  const tokenHash = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const user = await repo.findUserByVerificationToken(tokenHash);
  if (!user) throw new BadRequestError('Invalid verification token');

  if (
    !user.emailVerificationTokenExpires ||
    Math.floor(Date.now() / 1000) > user.emailVerificationTokenExpires
  ) {
    throw new BadRequestError('Verification token expired');
  }

  if (user.pendingEmail) {
    await repo.applyPendingEmail(user.id, user.pendingEmail);
  } else {
    await repo.markEmailVerified(user.id);
  }
}

/**
 * Generates a random verification token, returns both the raw token and its hash.
 * The raw token is meant to be sent to the user (e.g. via email), while the hash
 * is meant to be stored in the database for later verification.
 *
 * @returns {{ rawToken: string; tokenHash: string; expires: number }}
 */
function generateVerificationToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');

  const tokenHash = crypto
    .createHash('sha256')
    .update(rawToken)
    .digest('hex');

  const expires =
    Math.floor(Date.now() / 1000) + 24 * 60 * 60;

  return { rawToken, tokenHash, expires };
}

/**
 * Resends the verification email to a user if they exist and are not already verified.
 * This is used when a user tries to register with an email that already exists but
 * is not verified — instead of throwing a ConflictError, we generate a new token,
 * update the database, and resend the email. This allows users who may have lost or
 * deleted the original verification email to still verify their account.
 * The email is normalised before lookup. If the user does not exist or is already verified,
 * this function does nothing to prevent email enumeration.
 *
 * @param {string} email - The email address to resend the verification email to.
 * @returns {Promise<void>}
 */
export async function resendVerificationEmail(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase();

  const user = await repo.findUserByEmail(normalizedEmail);

  // prevent email enumeration
  if (!user) return;

  if (user.emailVerified) return;

  const { rawToken, tokenHash, expires } = generateVerificationToken();

  await repo.updateVerificationToken(user.id, tokenHash, expires);

  await sendVerificationEmail(normalizedEmail, rawToken);
}

/**
 * Updates a user's first and last name.
 *
 * @param {string} userId - UUID of the authenticated user.
 * @param {string} firstName - New first name.
 * @param {string} lastName - New last name.
 * @returns {Promise<PublicUser>}
 * @throws {NotFoundError} If the user does not exist.
 */
export async function updateName(
  userId: string,
  firstName: string,
  lastName: string
): Promise<PublicUser> {
  const user = await repo.findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  await repo.updateName(userId, firstName, lastName);

  return toPublicUser({ ...user, firstName, lastName });
}

/**
 * Updates a user's password after verifying the current password.
 *
 * @param {string} userId - UUID of the authenticated user.
 * @param {string} currentPassword - Plaintext current password for verification.
 * @param {string} newPassword - Plaintext new password.
 * @returns {Promise<void>}
 * @throws {NotFoundError} If the user does not exist.
 * @throws {UnauthorizedError} If the current password is incorrect.
 * @throws {BadRequestError} If the new password fails complexity rules.
 */
export async function updatePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  jti: string,
  jwtExp: number
): Promise<void> {
  const user = await repo.findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  const isValid = await verify(user.password_hash, currentPassword);
  if (!isValid) throw new UnauthorizedError('Current password is incorrect');

  validatePasswordComplexity(newPassword);

  const newHash = await hash(newPassword);
  await repo.updatePassword(userId, newHash);

  // Revoke the current access token immediately so this session cannot be
  await authTokensRepo.revokeAccessToken(jti, userId, jwtExp);

  // Invalidate all other sessions so a compromised session cannot outlive a password change.
  await authTokensRepo.deleteAllRefreshTokensForUser(userId);

  await sendPasswordChangedEmail(user.email);
}

/**
 * Initiates an email change by storing the new email as pending and sending
 * a verification email to it. The email is not changed until verified.
 *
 * @param {string} userId - UUID of the authenticated user.
 * @param {string} newEmail - New email address to change to.
 * @param {string} currentPassword - Plaintext current password for identity confirmation.
 * @returns {Promise<void>}
 * @throws {NotFoundError} If the user does not exist.
 * @throws {UnauthorizedError} If the current password is incorrect.
 * @throws {ConflictError} If the new email is already registered.
 */
export async function initiateEmailChange(
  userId: string,
  newEmail: string,
  currentPassword: string
): Promise<void> {
  const normalizedEmail = newEmail.toLowerCase();

  const user = await repo.findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  const isValid = await verify(user.password_hash, currentPassword);
  if (!isValid) throw new UnauthorizedError('Current password is incorrect');

  const existing = await repo.findUserByEmail(normalizedEmail);
  if (existing) throw new ConflictError('Email already registered');

  const { rawToken, tokenHash, expires } = generateVerificationToken();

  await repo.updatePendingEmail(userId, normalizedEmail, tokenHash, expires);
  await sendVerificationEmail(normalizedEmail, rawToken);
}

/**
 * Revokes the access token identified by `jti` so subsequent requests
 * carrying it are rejected by the auth middleware.
 *
 * The revocation record is written to DynamoDB with a TTL matching the
 * token's original `exp`, so no manual cleanup is needed.
 *
 * When a `refreshTokenId` is supplied the corresponding refresh token is
 * also deleted, terminating the session fully. Omitting it revokes only
 * the current access token and deletes the refresh token from the store.
 *
 * @param {string} jti - JWT ID claim from the access token to revoke.
 * @param {string} userId - Owner of the token.
 * @param {number} jwtExp - Original JWT `exp` claim (Unix seconds).
 * @param {string} rawRefreshToken - The opaque refresh token sent by the client.
 *   Format: "<tokenId>.<rawSecret>". The tokenId is extracted and used to delete
 *   the stored record. If the format is invalid the deletion is skipped — the
 *   access token is still revoked so the session is effectively ended.
 * @returns {Promise<void>}
 */
export async function logoutUser(
  jti: string,
  userId: string,
  jwtExp: number,
  rawRefreshToken: string
): Promise<void> {
  await authTokensRepo.revokeAccessToken(jti, userId, jwtExp);

  // Parse "<tokenId>.<rawSecret>" to extract the lookup key and delete the
  const dotIndex = rawRefreshToken.indexOf('.');
  if (dotIndex !== -1) {
    const tokenId = rawRefreshToken.slice(0, dotIndex);
    await authTokensRepo.deleteRefreshToken(tokenId);
  }
}

/**
 * Issues a new access + refresh token pair given a valid refresh token.
 * Implements refresh token rotation: the incoming refresh token is deleted
 * and a brand-new one is issued, limiting the blast radius of a stolen token.
 *
 * Security properties:
 * - The raw refresh token is never stored; only its SHA-256 hash is persisted.
 * - Rotation means each refresh token is single-use.
 * - Expired tokens are rejected (DynamoDB TTL may lag, so we check `expiresAt`
 *   explicitly against the current time for defense-in-depth).
 * - If the user no longer exists the refresh is rejected.
 *
 * @param {string} rawRefreshToken - The opaque refresh token sent by the client.
 *   Format: "<tokenId>.<rawSecret>" where tokenId is the UUID used to look up
 *   the record and rawSecret is the 32-byte hex value that is hashed for comparison.
 * @returns {Promise<{ accessToken: string; refreshToken: string }>}
 * @throws {UnauthorizedError} When the token is invalid, expired, or the user is gone.
 */
export async function refreshAccessToken(
  rawRefreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  // The client sends "<tokenId>.<rawSecret>" as a single opaque string.
  const dotIndex = rawRefreshToken.indexOf('.');
  if (dotIndex === -1) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  const tokenId = rawRefreshToken.slice(0, dotIndex);
  const rawSecret = rawRefreshToken.slice(dotIndex + 1);

  const record = await authTokensRepo.findRefreshToken(tokenId);
  if (!record) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  // Defense-in-depth: reject explicitly expired tokens even if DynamoDB TTL
  // has not yet purged the row (TTL deletion can lag by up to 48 hours).
  if (Math.floor(Date.now() / 1000) > record.expiresAt) {
    throw new UnauthorizedError('Refresh token expired');
  }

  // Constant-time comparison to prevent timing attacks on the hash.
  const incomingHash = crypto.createHash('sha256').update(rawSecret).digest('hex');
  const storedHashBuf = Buffer.from(record.tokenHash, 'hex');
  const incomingHashBuf = Buffer.from(incomingHash, 'hex');

  if (
    storedHashBuf.length !== incomingHashBuf.length ||
    !crypto.timingSafeEqual(storedHashBuf, incomingHashBuf)
  ) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  // Load the user to embed current email in the new access token.
  const user = await repo.findUserById(record.userId);
  if (!user) {
    // User was deleted after this refresh token was issued.
    throw new UnauthorizedError('Invalid refresh token');
  }

  // Rotate: issue the fresh pair first, then delete the consumed token.
  // Issuing before deleting means a client retry during a transient failure
  // won't be left without a valid token pair.
  const accessToken = issueAccessToken(user.id, user.email);
  const newRefreshToken = await issueRefreshToken(user.id);
  await authTokensRepo.deleteRefreshToken(tokenId);

  return { accessToken, refreshToken: newRefreshToken };
}

/**
 * Issues a short-lived (15 min) signed JWT access token containing a `jti`
 * claim so the token can be individually revoked on logout.
 *
 * @param {string} userId - Subject of the token.
 * @param {string} email - Embedded for convenience (avoids a DB lookup on verify).
 * @returns {string} Signed JWT.
 */
export function issueAccessToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email, jti: uuidv4() },
    getJwtSecret(),
    { expiresIn: '15m', algorithm: 'HS256' }
  );
}

/**
 * Creates, persists, and returns an opaque refresh token for a user.
 * The returned string has the format "<tokenId>.<rawSecret>" — the tokenId
 * enables lookup while the rawSecret is what is hashed and compared.
 *
 * @param {string} userId - Owner of the refresh token.
 * @returns {Promise<string>} The opaque refresh token to deliver to the client.
 */
export async function issueRefreshToken(userId: string): Promise<string> {
  const tokenId = uuidv4();
  const ttlSeconds = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
  const { rawToken: rawSecret, tokenHash, expiresAt } = generateOpaqueToken(ttlSeconds);

  await authTokensRepo.createRefreshToken(tokenId, userId, tokenHash, expiresAt);

  // Combine into a single opaque string the client treats as a black box.
  return `${tokenId}.${rawSecret}`;
}

/**
 * Initiates the forgot-password flow for a given email address.
 * Generates a short-lived reset token, stores its hash against the user record,
 * and emails the raw token to the supplied address.
 *
 * To prevent user enumeration, this function always returns without error
 * regardless of whether the email is registered. The caller should respond
 * with an identical 200 in either case.
 *
 * @param {string} email - The email address requesting a password reset.
 * @returns {Promise<void>}
 */
export async function forgotPassword(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  const user = await repo.findUserByEmail(normalizedEmail);

  // Return silently — never reveal whether the email is registered.
  if (!user || !user.emailVerified) return;

  const ttlSeconds = PASSWORD_RESET_TOKEN_TTL_MINUTES * 60;
  const { rawToken, tokenHash, expiresAt } = generateOpaqueToken(ttlSeconds);

  await repo.updatePasswordResetToken(user.id, tokenHash, expiresAt);
  await sendPasswordResetEmail(normalizedEmail, rawToken);
}

/**
 * Completes the password-reset flow.
 * Looks up the user by the hashed reset token, validates expiry, enforces
 * password complexity, hashes the new password, persists it, and clears the
 * reset token so it cannot be reused.
 *
 * @param {string} rawToken - The reset token received from the email link.
 * @param {string} newPassword - The new plaintext password.
 * @throws {BadRequestError} When the token is invalid, expired, or the
 *   new password fails complexity rules.
 */
export async function resetPassword(
  rawToken: string,
  newPassword: string
): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const user = await repo.findUserByPasswordResetToken(tokenHash);
  if (!user) throw new BadRequestError('Invalid password reset token');

  if (
    !user.passwordResetTokenExpires ||
    Math.floor(Date.now() / 1000) > user.passwordResetTokenExpires
  ) {
    throw new BadRequestError('Password reset token expired');
  }

  validatePasswordComplexity(newPassword);

  const newHash = await hash(newPassword);

  // Persist new hash and atomically clear the reset token to prevent reuse.
  await repo.updatePasswordAndClearResetToken(user.id, newHash);

  // Invalidate all active sessions — refresh tokens and any in-flight access tokens.
  await Promise.all([
    authTokensRepo.deleteAllRefreshTokensForUser(user.id),
    authTokensRepo.revokeAllAccessTokensForUser(user.id),
  ]);

  // Notify the account owner so they can detect unauthorized resets.
  await sendPasswordChangedEmail(user.email);
}

/**
 * Permanently deletes a user account after verifying the supplied password.
 * Also purges all refresh tokens for the user so any active sessions are
 * immediately invalidated.
 *
 * Note: Access tokens already issued are short-lived (15 min) and will
 * naturally expire; they are not individually revoked here because the user
 * record will no longer exist, causing auth middleware re-verification to fail.
 *
 * @param {string} userId - UUID of the authenticated user requesting deletion.
 * @param {string} currentPassword - Plaintext password supplied for confirmation.
 * @returns {Promise<void>}
 * @throws {NotFoundError} If the user does not exist.
 * @throws {UnauthorizedError} If the supplied password is incorrect.
 */
export async function deleteAccount(
  userId: string,
  currentPassword: string,
  jti: string,
  jwtExp: number
): Promise<void> {
  const user = await repo.findUserById(userId);
  if (!user) throw new NotFoundError('User not found');

  const isValid = await verify(user.password_hash, currentPassword);
  if (!isValid) throw new UnauthorizedError('Current password is incorrect');

  // Revoke the access token used to make this request
  await authTokensRepo.revokeAccessToken(jti, userId, jwtExp);

  // Purge all refresh tokens so every other session is also terminated.
  await authTokensRepo.deleteAllRefreshTokensForUser(userId);

  // Delete all user financial data before removing the user record.
  await deleteAllTransactionsForUser(userId);
  await deleteAllLiabilitiesForUser(userId);
  await deleteAllInvestmentDataForUser(userId);
  await deleteAllAccountsForUser(userId);
  await deleteAllItemsForUser(userId);
  await deleteAllBudgetsForUser(userId);

  // Notify the user before the record is deleted
  await sendAccountDeletedEmail(user.email);

  await repo.deleteUser(userId);
}