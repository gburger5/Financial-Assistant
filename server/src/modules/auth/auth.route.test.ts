/**
 * @module auth.route.test
 * @description HTTP integration tests for the /api/auth route plugin.
 * Exercises schema validation, middleware wiring, and end-to-end request flow
 * with the auth service fully mocked so no real DynamoDB or hashing occurs.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import errorHandlerPlugin from '../../plugins/errorHandler.plugin.js';
import { ConflictError, UnauthorizedError, BadRequestError } from '../../lib/errors.js';

vi.mock('./auth.service.js', () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  getUserById: vi.fn(),
}));

import authRoutes from './auth.route.js';
import * as authService from './auth.service.js';

const mockRegisterUser = vi.mocked(authService.registerUser);
const mockLoginUser = vi.mocked(authService.loginUser);

const TEST_SECRET = 'route-integration-test-secret';

/** Full app that mirrors production registration: error handler + auth routes. */
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
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

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { password: 'ValidPass1!', confirmPassword: 'ValidPass1!' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when email format is invalid (schema validation)', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'not-an-email', password: 'ValidPass1!', confirmPassword: 'ValidPass1!' },
    });

    expect(res.statusCode).toBe(400);
  });

  // Bug 1: lastName was not in the required array — missing it should yield 400
  it('returns 400 when lastName is missing (schema validation)', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'alice@example.com',
        password: 'ValidPass1!',
        confirmPassword: 'ValidPass1!',
        firstName: 'Alice',
        // lastName intentionally omitted
      },
    });

    expect(res.statusCode).toBe(400);
  });

  // Bug 1: firstName was not in the required array — missing it should yield 400
  it('returns 400 when firstName is missing (schema validation)', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'alice@example.com',
        password: 'ValidPass1!',
        confirmPassword: 'ValidPass1!',
        // firstName intentionally omitted
        lastName: 'Smith',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when password is shorter than 10 characters (schema validation)', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'alice@example.com', password: 'Short1!', confirmPassword: 'Short1!' },
    });

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
    });
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        password: 'ValidPass1!',
        confirmPassword: 'ValidPass1!',
        role: 'admin', // extra field — must be stripped before reaching service
      },
    });

    // Request succeeds because all required fields are present.
    expect(res.statusCode).toBe(201);
    // Service was called without the extra 'role' field.
    expect(mockRegisterUser).toHaveBeenCalledWith('alice@example.com', 'ValidPass1!', 'Alice', 'Smith');
  });

  it('returns 400 when passwords do not match (controller validation)', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        password: 'ValidPass1!',
        confirmPassword: 'Different1!',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Passwords do not match');
  });

  it('returns 409 when service throws ConflictError (email already registered)', async () => {
    mockRegisterUser.mockRejectedValue(new ConflictError('Email already registered'));
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        password: 'ValidPass1!',
        confirmPassword: 'ValidPass1!',
      },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 201 with PublicUser on successful registration', async () => {
    mockRegisterUser.mockResolvedValue({
      userId: 'user-uuid',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        password: 'ValidPass1!',
        confirmPassword: 'ValidPass1!',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.userId).toBe('user-uuid');
    expect(body.email).toBe('alice@example.com');
    expect(body.createdAt).toBeDefined();
  });

  // Bug 2: firstName and lastName were absent from publicUserSchema so they were stripped
  it('returns firstName and lastName in registration response', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRegisterUser.mockResolvedValue({
      userId: 'user-uuid',
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
      createdAt: '2024-01-01T00:00:00.000Z',
    } as any);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'alice@example.com',
        password: 'ValidPass1!',
        confirmPassword: 'ValidPass1!',
        firstName: 'Alice',
        lastName: 'Smith',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.firstName).toBe('Alice');
    expect(body.lastName).toBe('Smith');
  });

  it('strips unlisted fields from response (response schema whitelist)', async () => {
    // Service accidentally returns password_hash — schema must strip it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRegisterUser.mockResolvedValue({
      userId: 'user-uuid',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
      password_hash: '$argon2id$secret', // must be stripped by response schema
    } as any);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        password: 'ValidPass1!',
        confirmPassword: 'ValidPass1!',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).not.toHaveProperty('password_hash');
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe('POST /api/auth/login', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 400 when email is missing (schema validation)', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'ValidPass1!' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 when service throws UnauthorizedError (wrong credentials)', async () => {
    mockLoginUser.mockRejectedValue(new UnauthorizedError('Invalid email or password'));
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'WrongPass1!' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid email or password');
  });

  it('returns 400 when service throws BadRequestError (account locked)', async () => {
    mockLoginUser.mockRejectedValue(new BadRequestError('Account locked. Try again in 14 minutes.'));
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'ValidPass1!' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Account locked/);
  });

  it('returns 200 with user and token on success', async () => {
    mockLoginUser.mockResolvedValue({
      user: {
        userId: 'user-uuid', email: 'alice@example.com', createdAt: '2024-01-01T00:00:00.000Z',
        firstName: '',
        lastName: ''
      },
      token: 'jwt-token-here',
    });
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'ValidPass1!' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBe('jwt-token-here');
    expect(body.user.userId).toBe('user-uuid');
    expect(body.user.email).toBe('alice@example.com');
  });

  // Bug 2: firstName and lastName were absent from publicUserSchema so login response omitted them
  it('returns firstName and lastName in login response user object', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockLoginUser.mockResolvedValue({
      user: {
        userId: 'user-uuid',
        email: 'alice@example.com',
        firstName: 'Alice',
        lastName: 'Smith',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      token: 'jwt-token-here',
    } as any);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'ValidPass1!' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.firstName).toBe('Alice');
    expect(body.user.lastName).toBe('Smith');
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
    const token = jwt.sign({ userId: 'u-1', email: 'a@b.com' }, 'wrong-secret');

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/verify',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid token');
  });

  it('returns 200 with userId and email from a valid JWT', async () => {
    app = await buildTestApp();
    const token = jwt.sign(
      { userId: 'user-uuid', email: 'alice@example.com' },
      TEST_SECRET,
      { expiresIn: '15m' }
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/verify',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userId).toBe('user-uuid');
    expect(body.email).toBe('alice@example.com');
  });
});
