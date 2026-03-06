/**
 * @module auth.repository
 * @description DynamoDB data-access layer for the auth module.
 * Contains no business logic — each function has a single, named purpose.
 * The service layer decides what to do with the results (e.g. whether
 * null means "not found" or "error").
 */
import { QueryCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db } from '../../db/index.js';
import { Tables, Indexes } from '../../db/tables.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Full internal document shape stored in DynamoDB for every user.
 * The service controls which fields are exposed outward via PublicUser.
 */
export interface UserRecord {
  /** UUID v4 — primary key of the users table. */
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Argon2id hash of the user's password. Never returned to callers. */
  password_hash: string;
  /** Indicates whether the user's email address has been verified. */
  emailVerified: boolean;
  /** A unique token for email verification. */
  emailVerificationToken: string | null;
  emailVerificationTokenExpires: number | null;
  created_at: string;
  updated_at: string;
  /** Incremented on each failed login attempt; reset on success. */
  failedLoginAttempts: number;
  /** ISO timestamp until which logins are blocked. null when not locked. */
  accountLockedUntil: string | null;
  plaidItems: Array<{
    accessToken: string;
    itemId: string;
    linkedAt: string;
  }>;
  onboarding: {
    plaidLinked: boolean;
    budgetAnalyzed: boolean;
    budgetConfirmed: boolean;
  };
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Finds a user by email using the email GSI.
 * Returns null if no record is found. It is the service's responsibility to
 * decide whether not-found constitutes an error.
 *
 * @param {string} email - The email address to look up (case-sensitive; normalise before calling).
 * @returns {Promise<UserRecord | null>}
 */
export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Users,
      IndexName: Indexes.Users.emailIndex,
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    })
  );

  if (!result.Items || result.Items.length === 0) return null;
  return result.Items[0] as UserRecord;
}

/**
 * Finds a user by their primary-key ID.
 * Used after JWT verification to load fresh user data.
 * Returns null if not found.
 *
 * @param {string} userId - UUID of the user record.
 * @returns {Promise<UserRecord | null>}
 */
export async function findUserById(userId: string): Promise<UserRecord | null> {
  const result = await db.send(
    new GetCommand({
      TableName: Tables.Users,
      Key: { id: userId },
    })
  );

  return result.Item ? (result.Item as UserRecord) : null;
}

// ---------------------------------------------------------------------------
// Write functions
// ---------------------------------------------------------------------------

/**
 * Persists a new user document to DynamoDB.
 * Called exactly once during registration. The caller is responsible for
 * ensuring the email does not already exist (via findUserByEmail) before
 * calling this.
 *
 * @param {UserRecord} user - The fully-constructed user document to store.
 * @returns {Promise<void>}
 */
export async function createUser(user: UserRecord): Promise<void> {
  await db.send(
    new PutCommand({
      TableName: Tables.Users,
      Item: user,
    })
  );
}

/**
 * Patches only the login-failure tracking fields on an existing user record.
 * Uses UpdateExpression so no other concurrently-updated fields are overwritten.
 *
 * @param {string} userId - UUID of the user to update.
 * @param {number} failedLoginAttempts - New cumulative failure count.
 * @param {string | null} lockedUntil - ISO timestamp of lockout expiry, or null.
 * @returns {Promise<void>}
 */
export async function updateLoginFailure(
  userId: string,
  failedLoginAttempts: number,
  lockedUntil: string | null
): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: Tables.Users,
      Key: { id: userId },
      UpdateExpression:
        'SET failedLoginAttempts = :failedLoginAttempts, accountLockedUntil = :accountLockedUntil, updated_at = :updated_at',
      ExpressionAttributeValues: {
        ':failedLoginAttempts': failedLoginAttempts,
        ':accountLockedUntil': lockedUntil,
        ':updated_at': new Date().toISOString(),
      },
    })
  );
}

/**
 * Resets the login-failure counter and clears any active lockout on a user.
 * Called on successful login or when the lockout period has expired.
 * Uses UpdateExpression so no other fields are overwritten.
 *
 * @param {string} userId - UUID of the user to reset.
 * @returns {Promise<void>}
 */
export async function resetLockout(userId: string): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: Tables.Users,
      Key: { id: userId },
      UpdateExpression:
        'SET failedLoginAttempts = :zero, accountLockedUntil = :null, updated_at = :updated_at',
      ExpressionAttributeValues: {
        ':zero': 0,
        ':null': null,
        ':updated_at': new Date().toISOString(),
      },
    })
  );
}

/**
 * Finds a user by their email verification token hash.
 * Used when a user clicks the email verification link.
 *
 * NOTE:
 * This requires a DynamoDB GSI on `emailVerificationToken`.
 */
export async function findUserByVerificationToken(
  tokenHash: string
): Promise<UserRecord | null> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.Users,
      IndexName: Indexes.Users.emailVerificationTokenIndex,
      KeyConditionExpression: 'emailVerificationToken = :token',
      ExpressionAttributeValues: {
        ':token': tokenHash,
      },
      Limit: 1,
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  return result.Items[0] as UserRecord;
}

/**
 * Marks a user's email as verified and clears the verification token.
 */
export async function markEmailVerified(userId: string): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: Tables.Users,
      Key: { id: userId },
      UpdateExpression: `
        SET emailVerified = :true,
            updated_at = :updated_at
        REMOVE emailVerificationToken, emailVerificationTokenExpires
      `,
      ExpressionAttributeValues: {
        ':true': true,
        ':updated_at': new Date().toISOString(),
      },
    })
  );
}

/**
 * Updates a user's email verification token and expiry.
 * Called when generating a new token during registration or when resending the verification email.
 *
 * @param {string} userId - UUID of the user to update.
 * @param {string} tokenHash - SHA-256 hash of the new verification token.
 * @param {number} expires - Expiry time as a UNIX timestamp (seconds since epoch).
 * @returns {Promise<void>}
 */
export async function updateVerificationToken(
  userId: string,
  tokenHash: string,
  expires: number
): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: Tables.Users,
      Key: { id: userId },
      UpdateExpression: `
        SET emailVerificationToken = :token,
            emailVerificationTokenExpires = :expires,
            updated_at = :updated
      `,
      ExpressionAttributeValues: {
        ':token': tokenHash,
        ':expires': expires,
        ':updated': new Date().toISOString(),
      },
    })
  );
}
