import '../../mocks/auth.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getApp, closeApp, generateUniqueEmail, clearMockDb } from '../../helpers.js';
import type { FastifyInstance } from 'fastify';
import { LIMITS } from '../../../validation.js';

describe('POST /register', () => {
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

  it('should register a new user successfully', async () => {
    const email = generateUniqueEmail();
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'John',
        lastName: 'Doe',
        email,
        password: 'Pass123!',
        confirmPassword: 'Pass123!',
      },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.user).toHaveProperty('id');
    expect(body.user.email).toBe(email.toLowerCase());
    expect(body.user.firstName).toBe('John');
    expect(body.user.lastName).toBe('Doe');
  });

  it('should reject registration with mismatched passwords', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Test',
        lastName: 'User',
        email: generateUniqueEmail(),
        password: 'Pass123!',
        confirmPassword: 'DifferentPass',
      },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Passwords do not match');
  });

  it('should reject registration with missing fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Test',
        lastName: '',
        email: generateUniqueEmail(),
        password: 'Pass123!',
        confirmPassword: 'Pass123!',
      },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('All fields are required');
  });

  it('should reject registration with short password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Test',
        lastName: 'User',
        email: generateUniqueEmail(),
        password: '123',
        confirmPassword: '123',
      },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe(`Password must be between ${LIMITS.password.min} and ${LIMITS.password.max} characters`);
  });

  it('should reject registration with duplicate email', async () => {
    const email = generateUniqueEmail();
    await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'First', lastName: 'User', email,
        password: 'Pass123!', confirmPassword: 'Pass123!',
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Second', lastName: 'User', email,
        password: 'Pass123!', confirmPassword: 'Pass123!',
      },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('User already exists');
  });

  it('should reject password without uppercase', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Test', lastName: 'User',
        email: generateUniqueEmail(),
        password: 'pass123!', confirmPassword: 'pass123!',
      },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Password must contain uppercase, lowercase, and number');
  });

  it('should reject password without number', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Test', lastName: 'User',
        email: generateUniqueEmail(),
        password: 'Password!', confirmPassword: 'Password!',
      },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Password must contain uppercase, lowercase, and number');
  });

  it('should reject first name that is too long', async () => {
    const longName = 'A'.repeat(LIMITS.firstName.max + 1);
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: longName,
        lastName: 'User',
        email: generateUniqueEmail(),
        password: 'Pass123!',
        confirmPassword: 'Pass123!',
      },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe(`First name must be between ${LIMITS.firstName.min} and ${LIMITS.firstName.max} characters`);
  });

  it('should reject last name that is too long', async () => {
    const longName = 'B'.repeat(LIMITS.lastName.max + 1);
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Test',
        lastName: longName,
        email: generateUniqueEmail(),
        password: 'Pass123!',
        confirmPassword: 'Pass123!',
      },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe(`Last name must be between ${LIMITS.lastName.min} and ${LIMITS.lastName.max} characters`);
  });

  it('should reject first name that is too short', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: '',
        lastName: 'User',
        email: generateUniqueEmail(),
        password: 'Pass123!',
        confirmPassword: 'Pass123!',
      },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('All fields are required');
  });

  it('should reject last name that is too short', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Test',
        lastName: '',
        email: generateUniqueEmail(),
        password: 'Pass123!',
        confirmPassword: 'Pass123!',
      },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('All fields are required');
  });

  it('should normalize email to lowercase', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Test',
        lastName: 'User',
        email: `TEST${Date.now()}@EXAMPLE.COM`,
        password: 'Pass123!',
        confirmPassword: 'Pass123!',
      },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.user.email).toMatch(/^test.*@example\.com$/);
  });
});