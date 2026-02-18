import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, closeApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('Health Endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    await closeApp();
  });

  it('should return status ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({ status: 'ok' });
  });
});