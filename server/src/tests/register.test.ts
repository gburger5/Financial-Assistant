import 'dotenv/config';
import './mocks/auth.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getApp, closeApp, generateUniqueEmail, clearMockDb } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('POST /register', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getApp();
  });

  beforeEach(() => {
    clearMockDb(); // Clear data before each test
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
        password: 'Pass123',
        confirmPassword: 'Pass123',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('email');
    expect(body.firstName).toBe('John');
    expect(body.lastName).toBe('Doe');
    expect(body.email).toBe(email.toLowerCase());
  });

  it('should reject registration with mismatched passwords', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Test',
        lastName: 'User',
        email: generateUniqueEmail(),
        password: 'Pass123',
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
        password: 'Pass123',
        confirmPassword: 'Pass123',
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
    expect(body.error).toBe('Password must be at least 6 characters');
  });

  it('should reject duplicate email registration', async () => {
    const email = generateUniqueEmail();
    
    // First registration
    await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'First',
        lastName: 'User',
        email,
        password: 'Pass123',
        confirmPassword: 'Pass123',
      },
    });

    // Duplicate registration
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Second',
        lastName: 'User',
        email,
        password: 'Pass123',
        confirmPassword: 'Pass123',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('User already exists');
  });

  it('should normalize email to lowercase', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        firstName: 'Test',
        lastName: 'User',
        email: `TEST${Date.now()}@EXAMPLE.COM`,
        password: 'Pass123',
        confirmPassword: 'Pass123',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.email).toMatch(/^test.*@example\.com$/);
  });
});