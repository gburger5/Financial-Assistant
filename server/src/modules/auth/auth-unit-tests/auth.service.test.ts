/**
 * @module auth.service.test
 * @description Unit tests for auth business logic.
 * The repository and argon2 are fully mocked — no DynamoDB or real hashing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('../auth.repository.js', () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
  updateLoginFailure: vi.fn(),
  resetLockout: vi.fn(),
  findUserByVerificationToken: vi.fn(),
  markEmailVerified: vi.fn(),
  updateVerificationToken: vi.fn(),
}));

vi.mock('argon2', () => ({
  hash: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-uuid'),
}));

vi.mock('../../../lib/email.js', () => ({
  sendVerificationEmail: vi.fn(),
}));

import {
  validatePasswordComplexity,
  registerUser,
  loginUser,
  getUserById,
  verifyEmail,
  resendVerificationEmail,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MINUTES,
} from '../auth.service.js';
import * as repo from '../auth.repository.js';
import { hash, verify } from 'argon2';
import { sendVerificationEmail } from '../../../lib/email.js';
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from '../../../lib/errors.js';

const mockFindByEmail = vi.mocked(repo.findUserByEmail);
const mockFindById = vi.mocked(repo.findUserById);
const mockCreateUser = vi.mocked(repo.createUser);
const mockUpdateFailure = vi.mocked(repo.updateLoginFailure);
const mockResetLockout = vi.mocked(repo.resetLockout);
const mockFindByVerificationToken = vi.mocked(repo.findUserByVerificationToken);
const mockMarkEmailVerified = vi.mocked(repo.markEmailVerified);
const mockUpdateVerificationToken = vi.mocked(repo.updateVerificationToken);
const mockHash = vi.mocked(hash);
const mockVerify = vi.mocked(verify);
const mockSendVerificationEmail = vi.mocked(sendVerificationEmail);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleRecord: repo.UserRecord = {
  id: 'user-uuid',
  firstName: '',
  lastName: '',
  email: 'alice@example.com',
  password_hash: '$argon2id$hashed',
  emailVerified: true,
  emailVerificationToken: null,
  emailVerificationTokenExpires: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  failedLoginAttempts: 0,
  accountLockedUntil: null,
  plaidItems: [],
  onboarding: { plaidLinked: false, budgetAnalyzed: false, budgetConfirmed: false },
};

const unverifiedRecord: repo.UserRecord = {
  ...sampleRecord,
  emailVerified: false,
  emailVerificationToken: 'hashed-token',
  emailVerificationTokenExpires: Math.floor(Date.now() / 1000) + 3600,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-jwt-secret';
  mockSendVerificationEmail.mockResolvedValue(undefined);
  mockCreateUser.mockResolvedValue(undefined);
  mockMarkEmailVerified.mockResolvedValue(undefined);
  mockUpdateVerificationToken.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// validatePasswordComplexity
// ---------------------------------------------------------------------------

describe('validatePasswordComplexity', () => {
  it('throws BadRequestError when password has no uppercase letter', () => {
    expect(() => validatePasswordComplexity('nouppercase1')).toThrow(BadRequestError);
  });

  it('throws BadRequestError when password has no lowercase letter', () => {
    expect(() => validatePasswordComplexity('NOLOWERCASE1')).toThrow(BadRequestError);
  });

  it('throws BadRequestError when password has no digit', () => {
    expect(() => validatePasswordComplexity('NoDigitHere!')).toThrow(BadRequestError);
  });

  it('does not throw for a password containing uppercase, lowercase, and a digit', () => {
    expect(() => validatePasswordComplexity('ValidPass1')).not.toThrow();
  });

  it('does not throw when complexity is met even with special characters', () => {
    expect(() => validatePasswordComplexity('MyP@ssw0rd!')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// registerUser
// ---------------------------------------------------------------------------

describe('registerUser', () => {
  it('normalises the email to lowercase before querying and storing', async () => {
    mockFindByEmail.mockResolvedValue(null);
    mockHash.mockResolvedValue('$argon2id$hashed' as never);

    const result = await registerUser('Alice@EXAMPLE.COM', 'ValidPass1!', 'Alice', 'Smith');

    expect(mockFindByEmail).toHaveBeenCalledWith('alice@example.com');
    expect(result.email).toBe('alice@example.com');
  });

  it('throws BadRequestError when the password fails complexity rules', async () => {
    mockFindByEmail.mockResolvedValue(null);

    await expect(registerUser('alice@example.com', 'weakpassword', 'Alice', 'Smith')).rejects.toThrow(BadRequestError);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('resends verification email and returns existing user when email exists but is unverified', async () => {
    mockFindByEmail.mockResolvedValue(unverifiedRecord);

    const result = await registerUser('alice@example.com', 'ValidPass1!', 'Alice', 'Smith');

    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockUpdateVerificationToken).toHaveBeenCalled();
    expect(mockSendVerificationEmail).toHaveBeenCalled();
    expect(result.email).toBe('alice@example.com');
  });

  it('throws ConflictError when the email is already registered and verified', async () => {
    mockFindByEmail.mockResolvedValue(sampleRecord);

    await expect(registerUser('alice@example.com', 'ValidPass1!', 'Alice', 'Smith')).rejects.toThrow(ConflictError);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('hashes the password with argon2 before persisting', async () => {
    mockFindByEmail.mockResolvedValue(null);
    mockHash.mockResolvedValue('$argon2id$hashed' as never);

    await registerUser('alice@example.com', 'ValidPass1!', 'Alice', 'Smith');

    expect(mockHash).toHaveBeenCalledWith('ValidPass1!');
    const storedUser = mockCreateUser.mock.calls[0][0];
    expect(storedUser.password_hash).toBe('$argon2id$hashed');
  });

  it('never stores the plaintext password', async () => {
    mockFindByEmail.mockResolvedValue(null);
    mockHash.mockResolvedValue('$argon2id$hashed' as never);

    await registerUser('alice@example.com', 'ValidPass1!', 'Alice', 'Smith');

    const storedUser = mockCreateUser.mock.calls[0][0];
    expect(storedUser).not.toHaveProperty('password');
    expect(Object.values(storedUser)).not.toContain('ValidPass1!');
  });

  it('stores emailVerified as false and sets a verification token on new user', async () => {
    mockFindByEmail.mockResolvedValue(null);
    mockHash.mockResolvedValue('$argon2id$hashed' as never);

    await registerUser('alice@example.com', 'ValidPass1!', 'Alice', 'Smith');

    const storedUser = mockCreateUser.mock.calls[0][0];
    expect(storedUser.emailVerified).toBe(false);
    expect(storedUser.emailVerificationToken).toBeDefined();
    expect(storedUser.emailVerificationTokenExpires).toBeDefined();
  });

  it('sends a verification email on successful registration', async () => {
    mockFindByEmail.mockResolvedValue(null);
    mockHash.mockResolvedValue('$argon2id$hashed' as never);

    await registerUser('alice@example.com', 'ValidPass1!', 'Alice', 'Smith');

    expect(mockSendVerificationEmail).toHaveBeenCalledWith('alice@example.com', expect.any(String));
  });

  it('returns a PublicUser with userId, firstName, lastName, email, createdAt — no sensitive fields', async () => {
    mockFindByEmail.mockResolvedValue(null);
    mockHash.mockResolvedValue('$argon2id$hashed' as never);

    const result = await registerUser('alice@example.com', 'ValidPass1!', 'Alice', 'Smith');

    expect(result).toHaveProperty('userId');
    expect(result).toHaveProperty('firstName', 'Alice');
    expect(result).toHaveProperty('lastName', 'Smith');
    expect(result).toHaveProperty('email', 'alice@example.com');
    expect(result).toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('password_hash');
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('plaidItems');
  });
});

// ---------------------------------------------------------------------------
// loginUser
// ---------------------------------------------------------------------------

describe('loginUser', () => {
  it('normalises the email to lowercase', async () => {
    mockFindByEmail.mockResolvedValue(null);
    mockVerify.mockResolvedValue(false as never);

    try {
      await loginUser('ALICE@EXAMPLE.COM', 'ValidPass1!');
    } catch { /* expected to throw */ }

    expect(mockFindByEmail).toHaveBeenCalledWith('alice@example.com');
  });

  it('throws UnauthorizedError when the email is not found (prevents user enumeration)', async () => {
    mockFindByEmail.mockResolvedValue(null);
    mockVerify.mockResolvedValue(false as never);

    await expect(loginUser('nobody@example.com', 'ValidPass1!')).rejects.toThrow(UnauthorizedError);
  });

  it('still calls argon2.verify when the user is not found (constant-time anti-enumeration)', async () => {
    mockFindByEmail.mockResolvedValue(null);
    mockVerify.mockResolvedValue(false as never);

    try {
      await loginUser('nobody@example.com', 'ValidPass1!');
    } catch { /* expected to throw */ }

    expect(mockVerify).toHaveBeenCalled();
  });

  it('throws UnauthorizedError when the user exists but email is not verified', async () => {
    mockFindByEmail.mockResolvedValue(unverifiedRecord);

    await expect(loginUser('alice@example.com', 'ValidPass1!')).rejects.toThrow(UnauthorizedError);
  });

  it('throws BadRequestError with minutes remaining when account is locked', async () => {
    const future = new Date(Date.now() + 14 * 60_000).toISOString();
    mockFindByEmail.mockResolvedValue({ ...sampleRecord, accountLockedUntil: future });

    await expect(loginUser('alice@example.com', 'ValidPass1!')).rejects.toThrow(BadRequestError);
    await expect(loginUser('alice@example.com', 'ValidPass1!')).rejects.toThrow(/Account locked/);
  });

  it('throws UnauthorizedError when the password is wrong', async () => {
    mockFindByEmail.mockResolvedValue(sampleRecord);
    mockVerify.mockResolvedValue(false as never);

    await expect(loginUser('alice@example.com', 'WrongPass1!')).rejects.toThrow(UnauthorizedError);
  });

  it('increments failedLoginAttempts on each wrong password', async () => {
    mockFindByEmail.mockResolvedValue({ ...sampleRecord, failedLoginAttempts: 2 });
    mockVerify.mockResolvedValue(false as never);
    mockUpdateFailure.mockResolvedValue(undefined);

    try {
      await loginUser('alice@example.com', 'WrongPass1!');
    } catch { /* expected to throw */ }

    expect(mockUpdateFailure).toHaveBeenCalledWith('user-uuid', 3, null);
  });

  it('sets accountLockedUntil when failures reach MAX_LOGIN_ATTEMPTS', async () => {
    mockFindByEmail.mockResolvedValue({
      ...sampleRecord,
      failedLoginAttempts: MAX_LOGIN_ATTEMPTS - 1,
    });
    mockVerify.mockResolvedValue(false as never);
    mockUpdateFailure.mockResolvedValue(undefined);

    try {
      await loginUser('alice@example.com', 'WrongPass1!');
    } catch { /* expected to throw */ }

    const [, , lockedUntil] = mockUpdateFailure.mock.calls[0];
    expect(lockedUntil).not.toBeNull();
    const lockMs = new Date(lockedUntil!).getTime();
    const expectedMs = Date.now() + LOCKOUT_DURATION_MINUTES * 60_000;
    expect(lockMs).toBeGreaterThan(Date.now());
    expect(lockMs).toBeLessThanOrEqual(expectedMs + 1000);
  });

  it('calls resetLockout and returns user + token on correct password', async () => {
    mockFindByEmail.mockResolvedValue(sampleRecord);
    mockVerify.mockResolvedValue(true as never);
    mockResetLockout.mockResolvedValue(undefined);

    const result = await loginUser('alice@example.com', 'ValidPass1!');

    expect(mockResetLockout).toHaveBeenCalledWith('user-uuid');
    expect(result.user).toMatchObject({ userId: 'user-uuid', email: 'alice@example.com' });
    expect(result.token).toBeDefined();
  });

  it('issues a JWT that contains only userId and email', async () => {
    mockFindByEmail.mockResolvedValue(sampleRecord);
    mockVerify.mockResolvedValue(true as never);
    mockResetLockout.mockResolvedValue(undefined);

    const { token } = await loginUser('alice@example.com', 'ValidPass1!');
    const decoded = jwt.decode(token) as Record<string, unknown>;

    expect(decoded.userId).toBe('user-uuid');
    expect(decoded.email).toBe('alice@example.com');
    expect(decoded.firstName).toBeUndefined();
    expect(decoded.lastName).toBeUndefined();
    expect(decoded.jti).toBeUndefined();
  });

  it('throws BadRequestError with lockout message on the MAX_LOGIN_ATTEMPTS-th failed attempt', async () => {
    let dbUser: repo.UserRecord = { ...sampleRecord, failedLoginAttempts: 0, accountLockedUntil: null };
    mockFindByEmail.mockImplementation(async () => ({ ...dbUser }));
    mockVerify.mockResolvedValue(false as never);
    mockUpdateFailure.mockImplementation(async (_userId, failures, lockedUntil) => {
      dbUser = { ...dbUser, failedLoginAttempts: failures, accountLockedUntil: lockedUntil };
    });

    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i++) {
      await expect(loginUser('alice@example.com', 'WrongPass1!')).rejects.toThrow(UnauthorizedError);
    }

    let lockError: Error | undefined;
    try {
      await loginUser('alice@example.com', 'WrongPass1!');
    } catch (e) {
      lockError = e as Error;
    }
    expect(lockError).toBeInstanceOf(BadRequestError);
    expect(lockError?.message).toMatch(/Account locked\. Try again in \d+ minutes\./);
    expect(dbUser.accountLockedUntil).not.toBeNull();
  });

  it('resets lockout and continues login when the lockout period has expired', async () => {
    const past = new Date(Date.now() - 1_000).toISOString();
    mockFindByEmail.mockResolvedValue({ ...sampleRecord, accountLockedUntil: past });
    mockVerify.mockResolvedValue(true as never);
    mockResetLockout.mockResolvedValue(undefined);

    const result = await loginUser('alice@example.com', 'ValidPass1!');

    expect(mockResetLockout).toHaveBeenCalled();
    expect(result.token).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getUserById
// ---------------------------------------------------------------------------

describe('getUserById', () => {
  it('throws NotFoundError when the user does not exist', async () => {
    mockFindById.mockResolvedValue(null);

    await expect(getUserById('nonexistent-id')).rejects.toThrow(NotFoundError);
  });

  it('returns PublicUser when the user is found', async () => {
    mockFindById.mockResolvedValue(sampleRecord);

    const result = await getUserById('user-uuid');

    expect(result).toEqual({
      userId: 'user-uuid',
      firstName: '',
      lastName: '',
      email: 'alice@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
  });

  it('does not include sensitive fields in the returned PublicUser', async () => {
    mockFindById.mockResolvedValue(sampleRecord);

    const result = await getUserById('user-uuid');

    expect(result).not.toHaveProperty('password_hash');
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('plaidItems');
    expect(result).not.toHaveProperty('onboarding');
  });
});

// ---------------------------------------------------------------------------
// verifyEmail
// ---------------------------------------------------------------------------

describe('verifyEmail', () => {
  it('throws BadRequestError when the token hash matches no user', async () => {
    mockFindByVerificationToken.mockResolvedValue(null);

    await expect(verifyEmail('sometoken')).rejects.toThrow(BadRequestError);
  });

  it('throws BadRequestError when the token is expired', async () => {
    const expiredRecord: repo.UserRecord = {
      ...unverifiedRecord,
      emailVerificationTokenExpires: Math.floor(Date.now() / 1000) - 3600,
    };
    mockFindByVerificationToken.mockResolvedValue(expiredRecord);

    await expect(verifyEmail('sometoken')).rejects.toThrow(BadRequestError);
    await expect(verifyEmail('sometoken')).rejects.toThrow(/expired/);
  });

  it('calls markEmailVerified when the token is valid and not expired', async () => {
    mockFindByVerificationToken.mockResolvedValue(unverifiedRecord);

    await verifyEmail('sometoken');

    expect(mockMarkEmailVerified).toHaveBeenCalledWith(unverifiedRecord.id);
  });
});

// ---------------------------------------------------------------------------
// resendVerificationEmail
// ---------------------------------------------------------------------------

describe('resendVerificationEmail', () => {
  it('does nothing when the email does not exist (prevents enumeration)', async () => {
    mockFindByEmail.mockResolvedValue(null);

    await resendVerificationEmail('nobody@example.com');

    expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    expect(mockUpdateVerificationToken).not.toHaveBeenCalled();
  });

  it('does nothing when the user is already verified (prevents enumeration)', async () => {
    mockFindByEmail.mockResolvedValue(sampleRecord);

    await resendVerificationEmail('alice@example.com');

    expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    expect(mockUpdateVerificationToken).not.toHaveBeenCalled();
  });

  it('generates a new token and resends the email for an unverified user', async () => {
    mockFindByEmail.mockResolvedValue(unverifiedRecord);

    await resendVerificationEmail('alice@example.com');

    expect(mockUpdateVerificationToken).toHaveBeenCalledWith(
      unverifiedRecord.id,
      expect.any(String),
      expect.any(Number)
    );
    expect(mockSendVerificationEmail).toHaveBeenCalledWith('alice@example.com', expect.any(String));
  });
});