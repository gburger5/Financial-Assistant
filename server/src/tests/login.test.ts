import 'dotenv/config';
import './mocks/auth.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getApp, closeApp, generateUniqueEmail, clearMockDb } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('POST /login', () => {
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

  it('should login successfully with valid credentials', async () => {
    const email = generateUniqueEmail();
    const password = 'Pass123';

    // Register user first
    await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Login',
        lastName: 'Test',
        email,
        password,
        confirmPassword: password,
      },
    });

    // Login
    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: {
        email,
        password,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('token');
    expect(body).toHaveProperty('user');
    expect(body.user.email).toBe(email.toLowerCase());
    expect(body.user.firstName).toBe('Login');
    expect(body.user.lastName).toBe('Test');
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
  });

  it('should reject login with invalid email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: {
        email: 'nonexistent@example.com',
        password: 'WrongPass',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Invalid credentials');
  });

  it('should reject login with invalid password', async () => {
    const email = generateUniqueEmail();

    // Register user
    await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Test',
        lastName: 'User',
        email,
        password: 'CorrectPass123',
        confirmPassword: 'CorrectPass123',
      },
    });

    // Try login with wrong password
    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: {
        email,
        password: 'WrongPass123',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Invalid credentials');
  });

  it('should handle case-insensitive email login', async () => {
    const email = generateUniqueEmail();

    // Register with lowercase
    await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Test',
        lastName: 'User',
        email: email.toLowerCase(),
        password: 'Pass123',
        confirmPassword: 'Pass123',
      },
    });

    // Login with uppercase
    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: {
        email: email.toUpperCase(),
        password: 'Pass123',
      },
    });

    expect(response.statusCode).toBe(200);
  });
});