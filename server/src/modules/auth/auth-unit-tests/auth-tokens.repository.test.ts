/**
 * @module auth-tokens.repository.test
 * @description Unit tests for the auth_tokens DynamoDB repository.
 * Covers the per-user session-invalidation functions added to support
 * the password-reset revocation flow.
 * The db client is fully mocked, no real DynamoDB calls occur.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factory
// ---------------------------------------------------------------------------

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../db/index.js', () => ({ db: { send: mockSend } }));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  revokeAllAccessTokensForUser,
  isSessionsInvalidatedForUser,
} from '../auth-tokens.repository.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// revokeAllAccessTokensForUser
// ---------------------------------------------------------------------------

describe('revokeAllAccessTokensForUser', () => {
  it('writes an invalidation marker to the AuthTokens table', async () => {
    mockSend.mockResolvedValue({});

    await revokeAllAccessTokensForUser('user-abc');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('auth_tokens');
  });

  it('uses the key "invalidate#<userId>" as the tokenId', async () => {
    mockSend.mockResolvedValue({});

    await revokeAllAccessTokensForUser('user-abc');

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.tokenId).toBe('invalidate#user-abc');
  });

  it('records the userId on the marker item', async () => {
    mockSend.mockResolvedValue({});

    await revokeAllAccessTokensForUser('user-abc');

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.userId).toBe('user-abc');
  });

  it('sets invalidatedAt to approximately now (Unix seconds)', async () => {
    mockSend.mockResolvedValue({});
    const before = Math.floor(Date.now() / 1000);

    await revokeAllAccessTokensForUser('user-abc');

    const after = Math.floor(Date.now() / 1000);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.invalidatedAt).toBeGreaterThanOrEqual(before);
    expect(cmd.input.Item.invalidatedAt).toBeLessThanOrEqual(after);
  });

  it('sets a TTL (expiresAt) on the marker so it is auto-purged by DynamoDB', async () => {
    mockSend.mockResolvedValue({});

    await revokeAllAccessTokensForUser('user-abc');

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Item.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});

// ---------------------------------------------------------------------------
// isSessionsInvalidatedForUser
// ---------------------------------------------------------------------------

describe('isSessionsInvalidatedForUser', () => {
  it('returns false when no invalidation marker exists for the user', async () => {
    mockSend.mockResolvedValue({ Item: undefined });

    const result = await isSessionsInvalidatedForUser('user-abc', 1_700_000_000);

    expect(result).toBe(false);
  });

  it('returns true when the marker invalidatedAt is after the token iat', async () => {
    const tokenIat = 1_700_000_000;
    mockSend.mockResolvedValue({ Item: { tokenId: 'invalidate#user-abc', userId: 'user-abc', invalidatedAt: tokenIat + 60 } });

    const result = await isSessionsInvalidatedForUser('user-abc', tokenIat);

    expect(result).toBe(true);
  });

  it('returns false when the marker invalidatedAt equals the token iat (not strictly after)', async () => {
    const tokenIat = 1_700_000_000;
    mockSend.mockResolvedValue({ Item: { tokenId: 'invalidate#user-abc', userId: 'user-abc', invalidatedAt: tokenIat } });

    const result = await isSessionsInvalidatedForUser('user-abc', tokenIat);

    // invalidatedAt === tokenIat is NOT strictly greater, so the token is still valid
    expect(result).toBe(false);
  });

  it('returns false when the marker invalidatedAt is before the token iat (token issued after reset)', async () => {
    const tokenIat = 1_700_000_100;
    mockSend.mockResolvedValue({ Item: { tokenId: 'invalidate#user-abc', userId: 'user-abc', invalidatedAt: tokenIat - 60 } });

    const result = await isSessionsInvalidatedForUser('user-abc', tokenIat);

    expect(result).toBe(false);
  });

  it('queries the auth_tokens table with the "invalidate#<userId>" key', async () => {
    mockSend.mockResolvedValue({ Item: undefined });

    await isSessionsInvalidatedForUser('user-xyz', 1_700_000_000);

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('auth_tokens');
    expect(cmd.input.Key.tokenId).toBe('invalidate#user-xyz');
  });
});
