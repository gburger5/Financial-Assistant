/**
 * @module auth.controller.test
 * @description Tests for the auth controller layer.
 * Controllers are mounted directly on a bare Fastify instance (no route
 * schema validation) so tests focus purely on controller logic: the password
 * mismatch check, service delegation, and correct status codes.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import errorHandlerPlugin from '../../../plugins/errorHandler.plugin.js';

vi.mock('../auth.service.js', () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  getUserById: vi.fn(),
}));

import * as authService from '../auth.service.js';
import { register, login, verify } from '../auth.controller.js';

const mockRegisterUser = vi.mocked(authService.registerUser);
const mockLoginUser = vi.mocked(authService.loginUser);
const mockGetUserById = vi.mocked(authService.getUserById);

/** Minimal Fastify app with controller handlers wired to plain routes. */
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);

  // Mount handlers directly — no schema validation so we test controller logic only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.post('/register', async (req, reply) => register(req as any, reply));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.post('/login', async (req, reply) => login(req as any, reply));
  app.get('/verify', async (req, reply) => verify(req, reply));

  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

describe('register controller', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 400 when passwords do not match', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        email: 'alice@example.com',
        password: 'ValidPass1!',
        confirmPassword: 'DifferentPass1!',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Passwords do not match');
  });

  it('does not call registerUser when passwords do not match', async () => {
    app = await buildTestApp();

    await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        email: 'alice@example.com',
        password: 'ValidPass1!',
        confirmPassword: 'DifferentPass1!',
      },
    });

    expect(mockRegisterUser).not.toHaveBeenCalled();
  });

  it('returns 201 and delegates to registerUser when passwords match', async () => {
    const publicUser = {
      userId: 'user-uuid',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    mockRegisterUser.mockResolvedValue(publicUser);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        password: 'ValidPass1!',
        confirmPassword: 'ValidPass1!',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(mockRegisterUser).toHaveBeenCalledWith('alice@example.com', 'ValidPass1!', 'Alice', 'Smith');
    expect(res.json()).toMatchObject({ userId: 'user-uuid', email: 'alice@example.com' });
  });
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

describe('login controller', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it('returns 200 and delegates to loginUser with the correct arguments', async () => {
    const loginResult = {
      user: {
        userId: 'user-uuid',
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        createdAt: '2024-01-01',
      },
      token: 'some-jwt',
    };
    mockLoginUser.mockResolvedValue(loginResult);
    app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'alice@example.com', password: 'ValidPass1!' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockLoginUser).toHaveBeenCalledWith('alice@example.com', 'ValidPass1!');
    expect(res.json().token).toBe('some-jwt');
  });
});

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

describe('verify controller', () => {
  it('returns 200 with a fresh DB read of the authenticated user', async () => {
    const dbUser = {
      userId: 'user-uuid',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
      agentBudgetApproved: false,
    };
    mockGetUserById.mockResolvedValue(dbUser as any);

    // Build a one-off app that pre-populates request.user before calling verify,
    // simulating what auth.plugin does in production.
    const app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    app.get('/verify', async (req, reply) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      req.user = { userId: 'user-uuid', email: 'alice@example.com' } as any;
      return verify(req, reply);
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/verify' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ userId: 'user-uuid', email: 'alice@example.com' });
  });
});
