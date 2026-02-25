import '../../mocks/auth.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getApp, closeApp, generateUniqueEmail, clearMockDb } from '../../helpers.js';
import type { FastifyInstance } from 'fastify';
import { mockDb } from '../../mocks/db.js';
import jwt from 'jsonwebtoken';

describe('POST /logout', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getApp();
  });

  beforeEach(() => {
    clearMockDb();
  });

  afterAll(async () => {
    await closeApp();
  });

  it('should logout successfully with a valid token', async () => {
    const email = generateUniqueEmail();
    const password = 'Pass123!';
    await app.inject({
      method: 'POST',
      url: '/register',
      payload: { firstName: 'Logout', lastName: 'Test', email, password, confirmPassword: password },
    });

    const loginResp = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email, password },
    });

    const body = JSON.parse(loginResp.body);
    const token = body.token;

    const response = await app.inject({
      method: 'POST',
      url: '/logout',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const respBody = JSON.parse(response.body);
    expect(respBody.success).toBe(true);

    // Decode the token to get the jti
    const decoded = jwt.decode(token) as { jti: string };
    const session = mockDb.getSession(decoded.jti);
    expect(session?.revoked).toBe(true);
  });

  it('should succeed even if the token was already revoked', async () => {
    const email = generateUniqueEmail();
    const password = 'Pass123!';
    await app.inject({
      method: 'POST',
      url: '/register',
      payload: { firstName: 'Logout', lastName: 'Test', email, password, confirmPassword: password },
    });

    const loginResp = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email, password },
    });

    const body = JSON.parse(loginResp.body);
    const token = body.token;

    const response = await app.inject({
      method: 'POST',
      url: '/logout',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const respBody = JSON.parse(response.body);
    expect(respBody.success).toBe(true);
  });

  it('should reject logout with no token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/logout',
    });

    expect(response.statusCode).toBe(401);
    const respBody = JSON.parse(response.body);
    expect(respBody.error).toBe('No token provided');
  });

  it('should reject logout with an invalid token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/logout',
      headers: { Authorization: `Bearer invalidtoken` },
    });

    expect(response.statusCode).toBe(401);
    const respBody = JSON.parse(response.body);
    expect(respBody.error).toBe('Invalid or expired token');
  });
});