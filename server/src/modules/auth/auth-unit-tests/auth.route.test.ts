/**
 * @module auth.route.test
 * @description HTTP integration tests for the /api/auth route plugin.
 * Exercises schema validation, middleware wiring, and end-to-end request flow
 * with the auth service fully mocked so no real DynamoDB or hashing occurs.
 *
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import errorHandlerPlugin from '../../../plugins/errorHandler.plugin.js';
import cookie from '@fastify/cookie';
import { ConflictError, UnauthorizedError, BadRequestError, NotFoundError } from '../../../lib/errors.js';

vi.mock('../auth.service.js', () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  getUserById: vi.fn(),
  updateName: vi.fn(),
  updatePassword: vi.fn(),
  initiateEmailChange: vi.fn(),
  logoutUser: vi.fn(),
  refreshAccessToken: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  deleteAccount: vi.fn(),
  updateBirthday: vi.fn(),
}));

// verifyJWT calls isAccessTokenRevoked — mock so tokens aren't checked against DB
vi.mock('../auth-tokens.repository.js', () => ({
  isAccessTokenRevoked: vi.fn().mockResolvedValue(false),
  isSessionsInvalidatedForUser: vi.fn().mockResolvedValue(false),
}));

import authRoutes from '../auth.route.js';
import * as authService from '../auth.service.js';

const mockRegisterUser = vi.mocked(authService.registerUser);
const mockLoginUser = vi.mocked(authService.loginUser);
const mockGetUserById = vi.mocked(authService.getUserById);
const mockUpdateName = vi.mocked(authService.updateName);
const mockUpdatePassword = vi.mocked(authService.updatePassword);
const mockInitiateEmailChange = vi.mocked(authService.initiateEmailChange);
const mockLogoutUser = vi.mocked(authService.logoutUser);
const mockRefreshAccessToken = vi.mocked(authService.refreshAccessToken);
const mockForgotPassword = vi.mocked(authService.forgotPassword);
const mockResetPassword = vi.mocked(authService.resetPassword);
const mockDeleteAccount = vi.mocked(authService.deleteAccount);
const mockUpdateBirthday = vi.mocked(authService.updateBirthday);

const TEST_SECRET = 'route-integration-test-secret';

/**
 * Mints a valid token with jti so verifyJWT accepts it.
 * All protected route tests must use this helper.
 */
function makeToken(payload: Record<string, unknown> = {}): string {
  return jwt.sign(
    { userId: 'user-route-123', email: 'alice@example.com', jti: 'test-jti', ...payload },
    TEST_SECRET,
    { expiresIn: '15m' }
  );
}

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(errorHandlerPlugin);
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = TEST_SECRET;
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

describe('POST /api/auth/register', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 400 when email is missing (schema validation)', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { password: 'ValidPass1!', confirmPassword: 'ValidPass1!' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when email format is invalid (schema validation)', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'not-an-email', password: 'ValidPass1!', confirmPassword: 'ValidPass1!' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when lastName is missing (schema validation)', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'alice@example.com', password: 'ValidPass1!', confirmPassword: 'ValidPass1!', firstName: 'Alice' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when firstName is missing (schema validation)', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'alice@example.com', password: 'ValidPass1!', confirmPassword: 'ValidPass1!', lastName: 'Smith' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when password is shorter than 10 characters', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'alice@example.com', password: 'Short1!', confirmPassword: 'Short1!', firstName: 'A', lastName: 'B' } });
    expect(res.statusCode).toBe(400);
  });

  it('strips extra body fields before they reach the service (additionalProperties: false)', async () => {
    // Fastify's default AJV config uses removeAdditional: 'all', which strips
    // unknown properties rather than rejecting the request. The security benefit
    // is that extra fields (e.g. 'role: admin') never reach the handler,
    // preventing mass-assignment even when all required fields are present.
    mockRegisterUser.mockResolvedValue({
      userId: 'u-1',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
      agentBudgetApproved: false,
    });
    app = await buildTestApp();
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: { firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', password: 'ValidPass1!', confirmPassword: 'ValidPass1!', role: 'admin' } });
    expect(mockRegisterUser).toHaveBeenCalledWith('alice@example.com', 'ValidPass1!', 'Alice', 'Smith');
  });

  it('returns 400 when passwords do not match (controller validation)', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', password: 'ValidPass1!', confirmPassword: 'Different1!' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Passwords do not match');
  });

  it('returns 409 when service throws ConflictError', async () => {
    mockRegisterUser.mockRejectedValue(new ConflictError('Email already registered'));
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', password: 'ValidPass1!', confirmPassword: 'ValidPass1!' } });
    expect(res.statusCode).toBe(409);
  });

  it('returns 201 with PublicUser on successful registration', async () => {
    mockRegisterUser.mockResolvedValue({
      userId: 'user-uuid',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
      agentBudgetApproved: false,
    });
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', password: 'ValidPass1!', confirmPassword: 'ValidPass1!' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().userId).toBe('user-uuid');
    expect(res.json().firstName).toBe('Alice');
    expect(res.json().lastName).toBe('Smith');
  });

  it('strips unlisted fields from response (response schema whitelist)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRegisterUser.mockResolvedValue({ userId: 'user-uuid', firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', createdAt: '2024-01-01T00:00:00.000Z', password_hash: '$argon2id$secret' } as any);
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', password: 'ValidPass1!', confirmPassword: 'ValidPass1!' } });
    expect(res.json()).not.toHaveProperty('password_hash');
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe('POST /api/auth/login', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 400 when email is missing', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'ValidPass1!' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 when service throws UnauthorizedError', async () => {
    mockLoginUser.mockRejectedValue(new UnauthorizedError('Invalid email or password'));
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alice@example.com', password: 'WrongPass1!' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid email or password');
  });

  it('returns 400 when service throws BadRequestError (account locked)', async () => {
    mockLoginUser.mockRejectedValue(new BadRequestError('Account locked. Try again in 14 minutes.'));
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alice@example.com', password: 'ValidPass1!' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Account locked/);
  });

  it('returns 200 with user in body and tokens in cookies on success', async () => {
    mockLoginUser.mockResolvedValue({
      user: {
        userId: 'user-uuid', email: 'alice@example.com', createdAt: '2024-01-01T00:00:00.000Z',
        firstName: 'Alice',
        lastName: 'Smith',
        agentBudgetApproved: false,
      },
      token: 'jwt-token-here',
      refreshToken: 'refresh-token-here',
    });
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alice@example.com', password: 'ValidPass1!' } });
    expect(res.statusCode).toBe(200);
    // Tokens are set as httpOnly cookies, not in the response body
    expect(res.json().user.firstName).toBe('Alice');
    expect(res.json().user.lastName).toBe('Smith');
    expect(res.cookies.find(c => c.name === 'accessToken')?.value).toBe('jwt-token-here');
    expect(res.cookies.find(c => c.name === 'refreshToken')?.value).toBe('refresh-token-here');
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/verify
// ---------------------------------------------------------------------------

describe('GET /api/auth/verify', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/auth/verify' });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('No token provided');
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    app = await buildTestApp();
    // Even with jti, wrong secret is rejected
    const token = jwt.sign({ userId: 'u-1', email: 'a@b.com', jti: 'j1' }, 'wrong-secret');
    const res = await app.inject({ method: 'GET', url: '/api/auth/verify', cookies: { accessToken: token } });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid token');
  });

  it('returns 401 for a token without a jti claim', async () => {
    app = await buildTestApp();
    // Old-style token — no jti — must be rejected
    const token = jwt.sign({ userId: 'u-1', email: 'a@b.com' }, TEST_SECRET, { expiresIn: '15m' });
    const res = await app.inject({ method: 'GET', url: '/api/auth/verify', cookies: { accessToken: token } });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid token');
  });

  it('returns 200 with userId and email from a valid JWT with jti', async () => {
    mockGetUserById.mockResolvedValueOnce({
      userId: 'user-uuid',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
      agentBudgetApproved: false,
    });
    app = await buildTestApp();
    const token = makeToken({ userId: 'user-uuid', email: 'alice@example.com' });
    const res = await app.inject({ method: 'GET', url: '/api/auth/verify', cookies: { accessToken: token } });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe('user-uuid');
    expect(res.json().email).toBe('alice@example.com');
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/auth/profile/name
// ---------------------------------------------------------------------------

describe('PATCH /api/auth/profile/name', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile/name', payload: { firstName: 'Alice', lastName: 'Smith' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when firstName is missing', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile/name', cookies: { accessToken: makeToken() }, payload: { lastName: 'Smith' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when lastName is missing', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile/name', cookies: { accessToken: makeToken() }, payload: { firstName: 'Alice' } });
    expect(res.statusCode).toBe(400);
  });

  it('calls updateName with the authenticated userId from the JWT', async () => {
    mockUpdateName.mockResolvedValue({ userId: 'user-route-123', firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', createdAt: '2024-01-01T00:00:00.000Z', agentBudgetApproved: false });
    app = await buildTestApp();
    await app.inject({ method: 'PATCH', url: '/api/auth/profile/name', cookies: { accessToken: makeToken() }, payload: { firstName: 'Alice', lastName: 'Smith' } });
    expect(mockUpdateName).toHaveBeenCalledWith('user-route-123', 'Alice', 'Smith');
  });

  it('returns 200 on success', async () => {
    mockUpdateName.mockResolvedValue({ userId: 'user-route-123', firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', createdAt: '2024-01-01T00:00:00.000Z', agentBudgetApproved: false });
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile/name', cookies: { accessToken: makeToken() }, payload: { firstName: 'Alice', lastName: 'Smith' } });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/auth/profile/password
// ---------------------------------------------------------------------------

describe('PATCH /api/auth/profile/password', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile/password', payload: { currentPassword: 'OldPass1!!!', newPassword: 'NewPass1!!!', confirmNewPassword: 'NewPass1!!!' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when currentPassword is missing', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile/password', cookies: { accessToken: makeToken() }, payload: { newPassword: 'NewPass1!', confirmNewPassword: 'NewPass1!' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when newPassword is missing', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile/password', cookies: { accessToken: makeToken() }, payload: { currentPassword: 'OldPass1!', confirmNewPassword: 'NewPass1!' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when confirmNewPassword is missing', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile/password', cookies: { accessToken: makeToken() }, payload: { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when passwords do not match', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile/password', cookies: { accessToken: makeToken() }, payload: { currentPassword: 'OldPass1!!', newPassword: 'NewPass1!!', confirmNewPassword: 'Different1!!' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Passwords do not match');
  });

  it('calls updatePassword with the authenticated userId, passwords, jti, and exp', async () => {
    mockUpdatePassword.mockResolvedValue(undefined);
    app = await buildTestApp();
    await app.inject({ method: 'PATCH', url: '/api/auth/profile/password', cookies: { accessToken: makeToken() }, payload: { currentPassword: 'OldPass1!!', newPassword: 'NewPass1!!', confirmNewPassword: 'NewPass1!!' } });
    expect(mockUpdatePassword).toHaveBeenCalledWith('user-route-123', 'OldPass1!!', 'NewPass1!!', 'test-jti', expect.any(Number));
  });

  it('returns 200 on success', async () => {
    mockUpdatePassword.mockResolvedValue(undefined);
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile/password', cookies: { accessToken: makeToken() }, payload: { currentPassword: 'OldPass1!!', newPassword: 'NewPass1!!', confirmNewPassword: 'NewPass1!!' } });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/auth/profile/email
// ---------------------------------------------------------------------------

describe('PATCH /api/auth/profile/email', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile/email', payload: { newEmail: 'new@example.com', currentPassword: 'ValidPass1!' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when newEmail is missing', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile/email', cookies: { accessToken: makeToken() }, payload: { currentPassword: 'ValidPass1!' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when currentPassword is missing', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile/email', cookies: { accessToken: makeToken() }, payload: { newEmail: 'new@example.com' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when newEmail is not a valid email', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile/email', cookies: { accessToken: makeToken() }, payload: { newEmail: 'not-an-email', currentPassword: 'ValidPass1!' } });
    expect(res.statusCode).toBe(400);
  });

  it('calls initiateEmailChange with the authenticated userId', async () => {
    mockInitiateEmailChange.mockResolvedValue(undefined);
    app = await buildTestApp();
    await app.inject({ method: 'PATCH', url: '/api/auth/profile/email', cookies: { accessToken: makeToken() }, payload: { newEmail: 'new@example.com', currentPassword: 'ValidPass1!' } });
    expect(mockInitiateEmailChange).toHaveBeenCalledWith('user-route-123', 'new@example.com', 'ValidPass1!');
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe('POST /api/auth/logout', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no accessToken cookie is present', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 even when refreshToken cookie is absent (graceful no-op on missing token)', async () => {
    mockLogoutUser.mockResolvedValue(undefined);
    app = await buildTestApp();
    // No refreshToken cookie — controller passes '' to logoutUser
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { accessToken: makeToken() } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 200 and calls logoutUser on success', async () => {
    mockLogoutUser.mockResolvedValue(undefined);
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { accessToken: makeToken(), refreshToken: 'rt-uuid.rawsecret' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockLogoutUser).toHaveBeenCalled();
  });

  it('passes jti, userId, exp, and refreshToken cookie to logoutUser', async () => {
    mockLogoutUser.mockResolvedValue(undefined);
    app = await buildTestApp();
    await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { accessToken: makeToken(), refreshToken: 'rt-uuid.rawsecret' } });
    const [jti, userId, exp, rawRefreshToken] = mockLogoutUser.mock.calls[0];
    expect(jti).toBe('test-jti');
    expect(userId).toBe('user-route-123');
    expect(typeof exp).toBe('number');
    expect(rawRefreshToken).toBe('rt-uuid.rawsecret');
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------

describe('POST /api/auth/refresh', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when refreshToken cookie is absent', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh' });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('No refresh token provided');
  });

  it('returns 200 with success and rotates tokens into cookies', async () => {
    mockRefreshAccessToken.mockResolvedValue({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token' });
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { refreshToken: 'rt-uuid.rawsecret' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.cookies.find(c => c.name === 'accessToken')?.value).toBe('new-access-token');
    expect(res.cookies.find(c => c.name === 'refreshToken')?.value).toBe('new-refresh-token');
  });

  it('calls refreshAccessToken with the refreshToken cookie value', async () => {
    mockRefreshAccessToken.mockResolvedValue({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token' });
    app = await buildTestApp();
    await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { refreshToken: 'rt-uuid.rawsecret' } });
    expect(mockRefreshAccessToken).toHaveBeenCalledWith('rt-uuid.rawsecret');
  });

  it('returns 401 when service throws UnauthorizedError (invalid/expired token)', async () => {
    mockRefreshAccessToken.mockRejectedValue(new UnauthorizedError('Invalid refresh token'));
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { refreshToken: 'bad-token' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid refresh token');
  });

  it('does not require an accessToken cookie (refresh uses only the refreshToken cookie)', async () => {
    mockRefreshAccessToken.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
    app = await buildTestApp();
    // No accessToken cookie — only refreshToken is needed
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { refreshToken: 'rt-uuid.rawsecret' } });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------

describe('POST /api/auth/forgot-password', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 400 when email is missing', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when email format is invalid', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email: 'not-an-email' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 even when the email is not registered (anti-enumeration)', async () => {
    mockForgotPassword.mockResolvedValue(undefined);
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email: 'nobody@example.com' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('calls forgotPassword with the provided email', async () => {
    mockForgotPassword.mockResolvedValue(undefined);
    app = await buildTestApp();
    await app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email: 'alice@example.com' } });
    expect(mockForgotPassword).toHaveBeenCalledWith('alice@example.com');
  });

  it('does not require an Authorization header', async () => {
    mockForgotPassword.mockResolvedValue(undefined);
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email: 'alice@example.com' } });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------

describe('POST /api/auth/reset-password', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 400 when token is missing', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/reset-password', payload: { newPassword: 'NewPass1!', confirmNewPassword: 'NewPass1!' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when newPassword is shorter than 10 characters', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/reset-password', payload: { token: 'tok', newPassword: 'Short1!', confirmNewPassword: 'Short1!' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when passwords do not match (controller validation)', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/reset-password', payload: { token: 'tok', newPassword: 'NewPass1!!!', confirmNewPassword: 'Different1!!' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Passwords do not match');
  });

  it('returns 200 on success', async () => {
    mockResetPassword.mockResolvedValue(undefined);
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/reset-password', payload: { token: 'valid-tok', newPassword: 'NewPass1!!!', confirmNewPassword: 'NewPass1!!!' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('calls resetPassword with token and newPassword only', async () => {
    mockResetPassword.mockResolvedValue(undefined);
    app = await buildTestApp();
    await app.inject({ method: 'POST', url: '/api/auth/reset-password', payload: { token: 'valid-tok', newPassword: 'NewPass1!!!', confirmNewPassword: 'NewPass1!!!' } });
    expect(mockResetPassword).toHaveBeenCalledWith('valid-tok', 'NewPass1!!!');
  });

  it('returns 400 when service throws BadRequestError (invalid or expired token)', async () => {
    mockResetPassword.mockRejectedValue(new BadRequestError('Invalid password reset token'));
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/reset-password', payload: { token: 'bad-tok', newPassword: 'NewPass1!!!', confirmNewPassword: 'NewPass1!!!' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Invalid password reset token');
  });

  it('does not require an Authorization header', async () => {
    mockResetPassword.mockResolvedValue(undefined);
    app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/reset-password', payload: { token: 'valid-tok', newPassword: 'NewPass1!!!', confirmNewPassword: 'NewPass1!!!' } });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/auth/account
// ---------------------------------------------------------------------------

describe('DELETE /api/auth/account', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 when no Authorization header is provided', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/auth/account', payload: { currentPassword: 'ValidPass1!' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when currentPassword is missing', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/auth/account', cookies: { accessToken: makeToken() }, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when currentPassword is shorter than 10 characters', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/auth/account', cookies: { accessToken: makeToken() }, payload: { currentPassword: 'Short1!' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 on success', async () => {
    mockDeleteAccount.mockResolvedValue(undefined);
    app = await buildTestApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/auth/account', cookies: { accessToken: makeToken() }, payload: { currentPassword: 'ValidPass1!!' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('calls deleteAccount with the authenticated userId and supplied password', async () => {
    mockDeleteAccount.mockResolvedValue(undefined);
    app = await buildTestApp();
    await app.inject({ method: 'DELETE', url: '/api/auth/account', cookies: { accessToken: makeToken() }, payload: { currentPassword: 'ValidPass1!!' } });
    expect(mockDeleteAccount).toHaveBeenCalledWith('user-route-123', 'ValidPass1!!', 'test-jti', expect.any(Number));
  });

  it('returns 401 when service throws UnauthorizedError (wrong password)', async () => {
    mockDeleteAccount.mockRejectedValue(new UnauthorizedError('Current password is incorrect'));
    app = await buildTestApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/auth/account', cookies: { accessToken: makeToken() }, payload: { currentPassword: 'WrongPass1!!' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Current password is incorrect');
  });

  it('returns 404 when service throws NotFoundError', async () => {
    mockDeleteAccount.mockRejectedValue(new NotFoundError('User not found'));
    app = await buildTestApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/auth/account', cookies: { accessToken: makeToken() }, payload: { currentPassword: 'ValidPass1!!' } });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/auth/profile
// ---------------------------------------------------------------------------

describe('PATCH /api/auth/profile', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 401 without auth', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile', payload: { birthday: '1990-05-15' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with updated user on valid birthday', async () => {
    mockUpdateBirthday.mockResolvedValue({ userId: 'user-route-123', firstName: 'Alice', lastName: 'Test', email: 'alice@example.com', createdAt: '2024-01-01T00:00:00.000Z', agentBudgetApproved: false, birthday: '1990-05-15' });
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile', cookies: { accessToken: makeToken() }, payload: { birthday: '1990-05-15' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().birthday).toBe('1990-05-15');
  });

  it('returns 400 when birthday is missing', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/auth/profile', cookies: { accessToken: makeToken() }, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('calls updateBirthday with correct userId and birthday', async () => {
    mockUpdateBirthday.mockResolvedValue({ userId: 'user-route-123', firstName: 'Alice', lastName: 'Test', email: 'alice@example.com', createdAt: '2024-01-01T00:00:00.000Z', agentBudgetApproved: false, birthday: '1990-05-15' });
    app = await buildTestApp();
    await app.inject({ method: 'PATCH', url: '/api/auth/profile', cookies: { accessToken: makeToken() }, payload: { birthday: '1990-05-15' } });
    expect(mockUpdateBirthday).toHaveBeenCalledWith('user-route-123', '1990-05-15');
  });
});
