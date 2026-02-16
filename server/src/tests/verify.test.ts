import 'dotenv/config';
import './mocks/auth.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getApp, closeApp, generateUniqueEmail, clearMockDb } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('GET /verify', () => {
  let app: FastifyInstance;
  let validToken: string;
  let testUser: { email: string; firstName: string; lastName: string };

  beforeAll(async () => {
    app = await getApp();
  });

  beforeEach(async () => {
    clearMockDb();
    
    // Create a user and get token before each test
    const email = generateUniqueEmail();
    testUser = { email, firstName: 'Verify', lastName: 'Test' };

    await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: testUser.firstName,
        lastName: testUser.lastName,
        email,
        password: 'Pass123',
        confirmPassword: 'Pass123',
      },
    });

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/login',
      payload: {
        email,
        password: 'Pass123',
      },
    });

    const loginBody = JSON.parse(loginResponse.body);
    validToken = loginBody.token;
  });

  afterAll(async () => {
    await closeApp();
  });

    it('should verify a valid token', async () => {
    const response = await app.inject({
        method: 'GET',
        url: '/verify',
        headers: {
        authorization: `Bearer ${validToken}`,
        },
    });

    // Log the response
    console.log('Token:', validToken);
    console.log('Response status:', response.statusCode);
    console.log('Response body:', response.body);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.valid).toBe(true);
    expect(body.user).toHaveProperty('userId');
    expect(body.user.email).toBe(testUser.email.toLowerCase());
    expect(body.user.firstName).toBe(testUser.firstName);
    expect(body.user.lastName).toBe(testUser.lastName);
    });

  it('should reject request without token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/verify',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('No token provided');
  });

  it('should reject request with invalid token format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/verify',
      headers: {
        authorization: 'InvalidFormat',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('No token provided');
  });

  it('should reject request with malformed token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/verify',
      headers: {
        authorization: 'Bearer invalid.token.here',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Invalid or expired token');
  });

  it('should reject token without Bearer prefix', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/verify',
      headers: {
        authorization: validToken, // Missing 'Bearer '
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('No token provided');
  });
});