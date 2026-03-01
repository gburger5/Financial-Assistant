/**
 * @module auth.repository.test
 * @description Unit tests for the auth DynamoDB repository.
 * The AWS SDK `db` client is fully mocked — no real DynamoDB is hit.
 * Each test verifies the correct command type and input fields are sent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted() executes before module imports, making mockSend available
// inside the vi.mock factory even though vi.mock is hoisted to the top.
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('../../../db/index.js', () => ({
  db: { send: mockSend },
}));

import {
  findUserByEmail,
  findUserById,
  createUser,
  updateLoginFailure,
  resetLockout,
  type UserRecord,
} from '../auth.repository.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleUser: UserRecord = {
  id: 'user-abc-123',
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@example.com',
  password_hash: '$argon2id$v=19$m=65536,t=3,p=4$hashed',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  failedLoginAttempts: 0,
  accountLockedUntil: null,
  plaidItems: [],
  onboarding: {
    plaidLinked: false,
    budgetAnalyzed: false,
    budgetConfirmed: false,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// findUserByEmail
// ---------------------------------------------------------------------------

describe('findUserByEmail', () => {
  it('returns null when Items array is empty', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    const result = await findUserByEmail('nobody@example.com');
    expect(result).toBeNull();
  });

  it('returns null when Items is absent from the response', async () => {
    mockSend.mockResolvedValue({});
    const result = await findUserByEmail('nobody@example.com');
    expect(result).toBeNull();
  });

  it('returns the first matching record when found', async () => {
    mockSend.mockResolvedValue({ Items: [sampleUser] });
    const result = await findUserByEmail('alice@example.com');
    expect(result).toEqual(sampleUser);
  });

  it('queries the email-index GSI on the Users table', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await findUserByEmail('alice@example.com');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Users');
    expect(cmd.input.IndexName).toBe('email-index');
  });

  it('filters by the exact email value provided', async () => {
    mockSend.mockResolvedValue({ Items: [] });
    await findUserByEmail('alice@example.com');
    const cmd = mockSend.mock.calls[0][0];
    // The email must appear somewhere in ExpressionAttributeValues
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain('alice@example.com');
  });
});

// ---------------------------------------------------------------------------
// findUserById
// ---------------------------------------------------------------------------

describe('findUserById', () => {
  it('returns null when Item is undefined', async () => {
    mockSend.mockResolvedValue({ Item: undefined });
    const result = await findUserById('unknown-id');
    expect(result).toBeNull();
  });

  it('returns the user record when found', async () => {
    mockSend.mockResolvedValue({ Item: sampleUser });
    const result = await findUserById('user-abc-123');
    expect(result).toEqual(sampleUser);
  });

  it('queries the Users table with id as the primary key', async () => {
    mockSend.mockResolvedValue({ Item: sampleUser });
    await findUserById('user-abc-123');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Users');
    expect(cmd.input.Key).toEqual({ id: 'user-abc-123' });
  });
});

// ---------------------------------------------------------------------------
// createUser
// ---------------------------------------------------------------------------

describe('createUser', () => {
  it('sends a PutCommand with the full user record to the Users table', async () => {
    mockSend.mockResolvedValue({});
    await createUser(sampleUser);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Users');
    expect(cmd.input.Item).toEqual(sampleUser);
  });

  it('returns undefined on success', async () => {
    mockSend.mockResolvedValue({});
    const result = await createUser(sampleUser);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// updateLoginFailure
// ---------------------------------------------------------------------------

describe('updateLoginFailure', () => {
  it('targets the correct user by primary key', async () => {
    mockSend.mockResolvedValue({});
    await updateLoginFailure('user-abc-123', 3, null);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Users');
    expect(cmd.input.Key).toEqual({ id: 'user-abc-123' });
  });

  it('includes the new failedLoginAttempts value in the expression', async () => {
    mockSend.mockResolvedValue({});
    await updateLoginFailure('user-abc-123', 3, null);
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain(3);
  });

  it('includes the lockedUntil value in the expression', async () => {
    const lockTime = '2024-06-01T01:00:00.000Z';
    mockSend.mockResolvedValue({});
    await updateLoginFailure('user-abc-123', 5, lockTime);
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain(lockTime);
  });

  it('uses UpdateCommand (not PutCommand) so concurrent writes are not overwritten', async () => {
    mockSend.mockResolvedValue({});
    await updateLoginFailure('user-abc-123', 1, null);
    const cmd = mockSend.mock.calls[0][0];
    // UpdateCommand has UpdateExpression; PutCommand has Item
    expect(cmd.input.UpdateExpression).toBeDefined();
    expect(cmd.input.Item).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resetLockout
// ---------------------------------------------------------------------------

describe('resetLockout', () => {
  it('targets the correct user by primary key', async () => {
    mockSend.mockResolvedValue({});
    await resetLockout('user-abc-123');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('Users');
    expect(cmd.input.Key).toEqual({ id: 'user-abc-123' });
  });

  it('resets failedLoginAttempts to 0', async () => {
    mockSend.mockResolvedValue({});
    await resetLockout('user-abc-123');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain(0);
  });

  it('sets accountLockedUntil to null', async () => {
    mockSend.mockResolvedValue({});
    await resetLockout('user-abc-123');
    const cmd = mockSend.mock.calls[0][0];
    const values = Object.values(cmd.input.ExpressionAttributeValues as Record<string, unknown>);
    expect(values).toContain(null);
  });

  it('uses UpdateCommand (not PutCommand) so other fields are preserved', async () => {
    mockSend.mockResolvedValue({});
    await resetLockout('user-abc-123');
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.UpdateExpression).toBeDefined();
    expect(cmd.input.Item).toBeUndefined();
  });
});
