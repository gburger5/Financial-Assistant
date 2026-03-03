/**
 * @module errorHandler.plugin.test
 * @description Integration tests for the global Fastify error handler plugin.
 * Verifies consistent error shape, AppError passthrough, 500 sanitisation,
 * and 404 for unmatched routes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import errorHandlerPlugin from '../errorHandler.plugin.js';
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
} from '../../lib/errors.js';

/** Builds a minimal Fastify app with only the error handler plugin. */
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  return app;
}

describe('errorHandler plugin — AppError subclasses', () => {
  let app: FastifyInstance;

  afterEach(async () => app?.close());

  it('returns 400 with correct shape for BadRequestError', async () => {
    app = await buildTestApp();
    app.get('/bad', async () => { throw new BadRequestError('invalid field'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/bad' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      statusCode: 400,
      error: 'BadRequestError',
      message: 'invalid field',
    });
  });

  it('returns 401 with correct shape for UnauthorizedError', async () => {
    app = await buildTestApp();
    app.get('/unauth', async () => { throw new UnauthorizedError('no token'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/unauth' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      statusCode: 401,
      error: 'UnauthorizedError',
      message: 'no token',
    });
  });

  it('returns 403 with correct shape for ForbiddenError', async () => {
    app = await buildTestApp();
    app.get('/forbidden', async () => { throw new ForbiddenError('not yours'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/forbidden' });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      statusCode: 403,
      error: 'ForbiddenError',
      message: 'not yours',
    });
  });

  it('returns 404 with correct shape for NotFoundError', async () => {
    app = await buildTestApp();
    app.get('/notfound', async () => { throw new NotFoundError('Budget not found'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/notfound' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      statusCode: 404,
      error: 'NotFoundError',
      message: 'Budget not found',
    });
  });

  it('returns 409 with correct shape for ConflictError', async () => {
    app = await buildTestApp();
    app.get('/conflict', async () => { throw new ConflictError('email already registered'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/conflict' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      statusCode: 409,
      error: 'ConflictError',
      message: 'email already registered',
    });
  });

  it('returns 503 with correct shape for ServiceUnavailableError', async () => {
    app = await buildTestApp();
    app.get('/unavail', async () => { throw new ServiceUnavailableError('Plaid is down'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/unavail' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      statusCode: 503,
      error: 'ServiceUnavailableError',
      message: 'Plaid is down',
    });
  });
});

// Bug 3: the error field used HTTP status text instead of the error constructor name
describe('errorHandler plugin — error field is constructor name, not HTTP status text', () => {
  let app: FastifyInstance;

  afterEach(async () => app?.close());

  it('uses "BadRequestError" not "Bad Request" as the error field for BadRequestError', async () => {
    app = await buildTestApp();
    app.get('/bad2', async () => { throw new BadRequestError('invalid field'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/bad2' });
    expect(res.json().error).toBe('BadRequestError');
  });

  it('uses "UnauthorizedError" not "Unauthorized" for UnauthorizedError', async () => {
    app = await buildTestApp();
    app.get('/unauth2', async () => { throw new UnauthorizedError('no token'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/unauth2' });
    expect(res.json().error).toBe('UnauthorizedError');
  });

  it('uses "ConflictError" not "Conflict" for ConflictError', async () => {
    app = await buildTestApp();
    app.get('/conflict2', async () => { throw new ConflictError('email taken'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/conflict2' });
    expect(res.json().error).toBe('ConflictError');
  });

  it('uses "ForbiddenError" not "Forbidden" for ForbiddenError', async () => {
    app = await buildTestApp();
    app.get('/forbidden2', async () => { throw new ForbiddenError('not yours'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/forbidden2' });
    expect(res.json().error).toBe('ForbiddenError');
  });

  it('uses "NotFoundError" not "Not Found" for NotFoundError', async () => {
    app = await buildTestApp();
    app.get('/notfound2', async () => { throw new NotFoundError('missing'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/notfound2' });
    expect(res.json().error).toBe('NotFoundError');
  });

  it('uses "ServiceUnavailableError" not "Service Unavailable" for ServiceUnavailableError', async () => {
    app = await buildTestApp();
    app.get('/unavail2', async () => { throw new ServiceUnavailableError('Plaid is down'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/unavail2' });
    expect(res.json().error).toBe('ServiceUnavailableError');
  });
});

describe('errorHandler plugin — unexpected errors', () => {
  let app: FastifyInstance;

  afterEach(async () => app?.close());

  it('returns generic 500 and does not leak the real message', async () => {
    app = await buildTestApp();
    app.get('/crash', async () => { throw new Error('DB connection string: postgres://secret'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/crash' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal Server Error',
    });
  });

  it('does not expose stack traces in the response', async () => {
    app = await buildTestApp();
    app.get('/crash2', async () => { throw new TypeError('cannot read property of undefined'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/crash2' });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.message).toBe('Internal Server Error');
    expect(JSON.stringify(body)).not.toContain('stack');
  });
});

describe('errorHandler plugin — Fastify schema validation errors', () => {
  let app: FastifyInstance;

  afterEach(async () => app?.close());

  it('returns 400 with standard shape when Fastify schema validation fails on body', async () => {
    app = await buildTestApp();
    app.post('/strict', {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string' } },
          additionalProperties: false,
        },
      },
    }, async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/strict',
      payload: { unexpected: 'field' }, // missing required 'name'
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
    expect(typeof body.message).toBe('string');
  });
});

describe('errorHandler plugin — unmatched routes', () => {
  let app: FastifyInstance;

  afterEach(async () => app?.close());

  it('returns 404 for a GET to an unknown path', async () => {
    app = await buildTestApp();
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.statusCode).toBe(404);
    expect(body.error).toBe('Not Found');
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
  });

  it('returns 404 for a POST to an unknown path', async () => {
    app = await buildTestApp();
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/ghost' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('Not Found');
  });
});
