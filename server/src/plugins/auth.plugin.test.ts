/**
 * @module auth.plugin.test
 * @description Integration tests for the JWT preHandler middleware.
 * Covers the three failure modes (missing token, expired, invalid signature)
 * and the happy path where request.user is populated.
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { verifyJWT } from './auth.plugin.js';
import errorHandlerPlugin from './errorHandler.plugin.js';

const TEST_SECRET = 'test-jwt-secret-for-auth-plugin-tests';

/** Sets JWT_SECRET before the module reads it so the lazy lookup matches. */
beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

/**
 * Builds a minimal Fastify app with the error handler and one protected
 * GET /protected route that echoes request.user back as JSON.
 *
 * @returns {Promise<FastifyInstance>}
 */
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  app.get('/protected', { preHandler: verifyJWT }, async (request) => {
    return request.user;
  });
  await app.ready();
  return app;
}

describe('verifyJWT — missing token', () => {
  let app: FastifyInstance;

  afterEach(async () => app?.close());

  it('returns 401 when Authorization header is absent', async () => {
    app = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      statusCode: 401,
      error: 'UnauthorizedError',
      message: 'No token provided',
    });
  });

  it('returns 401 when Authorization header is not Bearer scheme', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('No token provided');
  });

  it('returns 401 when Bearer token value is empty', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer ' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('No token provided');
  });
});

describe('verifyJWT — expired token', () => {
  let app: FastifyInstance;

  afterEach(async () => app?.close());

  it('returns 401 with "Token expired" for a token past its exp', async () => {
    app = await buildTestApp();
    // expiresIn: 0 causes immediate expiry
    const token = jwt.sign({ userId: 'u-1' }, TEST_SECRET, { expiresIn: 0 });

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Token expired');
  });
});

describe('verifyJWT — invalid token', () => {
  let app: FastifyInstance;

  afterEach(async () => app?.close());

  it('returns 401 with "Invalid token" for a wrong-signature token', async () => {
    app = await buildTestApp();
    const token = jwt.sign({ userId: 'u-1' }, 'wrong-secret');

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid token');
  });

  it('returns 401 with "Invalid token" for a completely malformed string', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer not.a.jwt' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid token');
  });
});

describe('verifyJWT — valid token', () => {
  let app: FastifyInstance;

  afterEach(async () => app?.close());

  it('calls next and attaches payload to request.user', async () => {
    app = await buildTestApp();
    const payload = {
      userId: 'u-abc',
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
      jti: 'jti-xyz',
    };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '15m' });

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userId).toBe('u-abc');
    expect(body.email).toBe('alice@example.com');
    expect(body.firstName).toBe('Alice');
    expect(body.lastName).toBe('Smith');
    expect(body.jti).toBe('jti-xyz');
  });

  it('only uses HS256 — rejects a token claiming alg:none', async () => {
    app = await buildTestApp();
    // Craft a token that claims alg:none by manipulating the header
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ userId: 'u-1' })).toString('base64url');
    const noneToken = `${header}.${body}.`;

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${noneToken}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
