/**
 * @module auth-tokens.repository
 * @description DynamoDB data-access layer for the auth_tokens table.
 * Handles persisting and querying revoked JWT jti values (logout) and
 * long-lived refresh tokens (token refresh flow).
 *
 * The table uses DynamoDB TTL on `expiresAt` so expired rows are removed
 * automatically — no manual cleanup needed.
 *
 * Table key: tokenId (S) — stores both revoked access token jti values and
 * refresh token ids under a type-prefixed key to avoid collisions:
 *   revoked#<jti>     — revoked access token entry
 *   refresh#<tokenId> — refresh token entry
 */
import { GetCommand, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { db } from '../../db/index.js';
import { Tables, Indexes } from '../../db/tables.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Record stored for a revoked access token.
 * TTL field `expiresAt` (Unix seconds) matches the original JWT exp so the
 * row is purged automatically once the token would have expired anyway.
 */
export interface RevokedTokenRecord {
  /** Prefixed key: "revoked#<jti>" */
  tokenId: string;
  /** The userId who owned the token — stored for audit purposes. */
  userId: string;
  /** Unix timestamp (seconds) — DynamoDB TTL attribute. */
  expiresAt: number;
}

/**
 * Record stored for a long-lived refresh token.
 * TTL field `expiresAt` (Unix seconds) drives automatic expiry.
 */
export interface RefreshTokenRecord {
  /** Prefixed key: "refresh#<tokenId>" */
  tokenId: string;
  /** The userId this refresh token belongs to. */
  userId: string;
  /**
   * SHA-256 hash of the raw refresh token value.
   * The raw value is sent to the client; only the hash is persisted,
   * following the same pattern as email verification tokens.
   */
  tokenHash: string;
  /** Unix timestamp (seconds) — DynamoDB TTL attribute. */
  expiresAt: number;
  /** ISO timestamp when this record was created. */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Revoked token functions (logout / jti blocklist)
// ---------------------------------------------------------------------------

/**
 * Persists a revoked access token jti so subsequent requests carrying it
 * are rejected. The row expires automatically via DynamoDB TTL once the
 * original JWT exp is reached.
 *
 * @param {string} jti - The JWT ID claim from the access token being revoked.
 * @param {string} userId - Owner of the token (stored for audit trail).
 * @param {number} jwtExp - Original JWT `exp` claim (Unix seconds). Used as TTL.
 * @returns {Promise<void>}
 */
export async function revokeAccessToken(
  jti: string,
  userId: string,
  jwtExp: number
): Promise<void> {
  const record: RevokedTokenRecord = {
    tokenId: `revoked#${jti}`,
    userId,
    expiresAt: jwtExp,
  };

  await db.send(
    new PutCommand({
      TableName: Tables.AuthTokens,
      Item: record,
    })
  );
}

/**
 * Checks whether a jti has been revoked (i.e. the token was logged out).
 * Returns true when the revocation record exists in the table.
 *
 * Note: DynamoDB TTL deletion is eventually consistent and may lag by up to
 * 48 hours. However, because revoked tokens are also short-lived (15 min),
 * the practical window where a stale row could cause a false positive is
 * negligible — the JWT itself would be expired by then.
 *
 * @param {string} jti - The JWT ID claim to check.
 * @returns {Promise<boolean>} True if the token has been revoked.
 */
export async function isAccessTokenRevoked(jti: string): Promise<boolean> {
  const result = await db.send(
    new GetCommand({
      TableName: Tables.AuthTokens,
      Key: { tokenId: `revoked#${jti}` },
    })
  );

  return result.Item !== undefined;
}

// ---------------------------------------------------------------------------
// Refresh token functions
// ---------------------------------------------------------------------------

/**
 * Persists a new refresh token record linked to a user.
 * Only the SHA-256 hash of the raw token is stored; the raw value is
 * returned to the caller for delivery to the client.
 *
 * @param {string} tokenId - Unique identifier for this refresh token (UUID v4).
 * @param {string} userId - The user this refresh token belongs to.
 * @param {string} tokenHash - SHA-256 hash of the raw refresh token value.
 * @param {number} expiresAt - Unix timestamp (seconds) when this token expires.
 * @returns {Promise<void>}
 */
export async function createRefreshToken(
  tokenId: string,
  userId: string,
  tokenHash: string,
  expiresAt: number
): Promise<void> {
  const record: RefreshTokenRecord = {
    tokenId: `refresh#${tokenId}`,
    userId,
    tokenHash,
    expiresAt,
    createdAt: new Date().toISOString(),
  };

  await db.send(
    new PutCommand({
      TableName: Tables.AuthTokens,
      Item: record,
    })
  );
}

/**
 * Retrieves a refresh token record by its tokenId.
 * Returns null if not found or already expired (TTL-deleted).
 *
 * @param {string} tokenId - The refresh token UUID to look up.
 * @returns {Promise<RefreshTokenRecord | null>}
 */
export async function findRefreshToken(tokenId: string): Promise<RefreshTokenRecord | null> {
  const result = await db.send(
    new GetCommand({
      TableName: Tables.AuthTokens,
      Key: { tokenId: `refresh#${tokenId}` },
    })
  );

  return result.Item ? (result.Item as RefreshTokenRecord) : null;
}

/**
 * Deletes a single refresh token record by its tokenId.
 * Called during token rotation (old token consumed, new one issued) and logout.
 *
 * @param {string} tokenId - The refresh token UUID to delete.
 * @returns {Promise<void>}
 */
export async function deleteRefreshToken(tokenId: string): Promise<void> {
  await db.send(
    new DeleteCommand({
      TableName: Tables.AuthTokens,
      Key: { tokenId: `refresh#${tokenId}` },
    })
  );
}

/**
 * Lists all refresh token records belonging to a specific user.
 * Used when logging out all sessions or deleting an account.
 *
 * Requires a GSI on `userId` on the auth_tokens table.
 *
 * @param {string} userId - The user whose refresh tokens should be listed.
 * @returns {Promise<RefreshTokenRecord[]>}
 */
export async function findRefreshTokensByUserId(userId: string): Promise<RefreshTokenRecord[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: Tables.AuthTokens,
      IndexName: Indexes.AuthTokens.userIdIndex,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'begins_with(tokenId, :prefix)',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':prefix': 'refresh#',
      },
    })
  );

  return (result.Items ?? []) as RefreshTokenRecord[];
}

/**
 * Deletes all refresh tokens belonging to a user.
 * Batch-deletes via individual DeleteCommands (DynamoDB batch write has a
 * 25-item limit; for most users the count is low enough that sequential
 * deletes are simpler and safe).
 *
 * @param {string} userId - The user whose sessions should all be revoked.
 * @returns {Promise<void>}
 */
export async function deleteAllRefreshTokensForUser(userId: string): Promise<void> {
  const tokens = await findRefreshTokensByUserId(userId);

  await Promise.all(
    tokens.map((t) =>
      db.send(
        new DeleteCommand({
          TableName: Tables.AuthTokens,
          Key: { tokenId: t.tokenId },
        })
      )
    )
  );
}

/**
 * Records a per-user "all sessions invalidated at" marker in the AuthTokens
 * table. Any access token whose `iat` is at or before the recorded timestamp
 * will be rejected by the auth plugin.
 *
 * Stored under the key "invalidate#<userId>" with a 15-minute TTL — the
 * maximum remaining lifetime of any access token issued before this call.
 * After 15 minutes every such token has naturally expired, so the marker
 * can be safely purged by DynamoDB TTL.
 *
 * Called by the password-reset flow to close the window where a stolen
 * access token could still be used after the password is changed.
 *
 * @param {string} userId - The user whose access tokens should be invalidated.
 * @returns {Promise<void>}
 */
export async function revokeAllAccessTokensForUser(userId: string): Promise<void> {
  // Access tokens live 15 minutes; store the marker for that long.
  const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
  const now = Math.floor(Date.now() / 1000);

  await db.send(
    new PutCommand({
      TableName: Tables.AuthTokens,
      Item: {
        tokenId: `invalidate#${userId}`,
        userId,
        invalidatedAt: now,
        expiresAt: now + ACCESS_TOKEN_TTL_SECONDS,
      },
    })
  );
}

/**
 * Checks whether all access tokens for a user were invalidated after the
 * given token was issued. Used by the auth plugin alongside the per-token
 * JTI revocation check.
 *
 * Returns true when a marker exists AND the marker's `invalidatedAt` timestamp
 * is greater than `tokenIat`, meaning the token was issued before the
 * invalidation event (password reset, etc.) and must be rejected.
 *
 * @param {string} userId - The user whose invalidation marker to check.
 * @param {number} tokenIat - The `iat` claim (Unix seconds) from the access token.
 * @returns {Promise<boolean>} True when the token predates the invalidation marker.
 */
export async function isSessionsInvalidatedForUser(
  userId: string,
  tokenIat: number
): Promise<boolean> {
  const result = await db.send(
    new GetCommand({
      TableName: Tables.AuthTokens,
      Key: { tokenId: `invalidate#${userId}` },
    })
  );

  if (!result.Item) return false;
  return (result.Item.invalidatedAt as number) > tokenIat;
}