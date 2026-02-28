/**
 * @module auth.schema.test
 * @description Smoke tests for the auth JSON schemas and route-generic types.
 * These guard against accidental shape regressions (e.g. removing a required
 * field or forgetting additionalProperties: false).
 */
import { describe, it, expect } from 'vitest';
import {
  publicUserSchema,
  registerSchema,
  loginSchema,
  verifySchema,
} from './auth.schema.js';

describe('publicUserSchema', () => {
  it('declares userId, email, and createdAt properties', () => {
    const { properties } = publicUserSchema;
    expect(properties).toHaveProperty('userId');
    expect(properties).toHaveProperty('email');
    expect(properties).toHaveProperty('createdAt');
  });

  // Bug 2: firstName and lastName were missing from the response schema whitelist
  it('declares firstName and lastName properties', () => {
    const { properties } = publicUserSchema;
    expect(properties).toHaveProperty('firstName');
    expect(properties).toHaveProperty('lastName');
  });
});

describe('registerSchema', () => {
  it('requires email, password, and confirmPassword', () => {
    const required = registerSchema.body.required as readonly string[];
    expect(required).toContain('email');
    expect(required).toContain('password');
    expect(required).toContain('confirmPassword');
  });

  // Bug 1: lastName (and firstName) were missing from required
  it('requires firstName and lastName', () => {
    const required = registerSchema.body.required as readonly string[];
    expect(required).toContain('firstName');
    expect(required).toContain('lastName');
  });

  it('declares firstName and lastName as string properties', () => {
    const { properties } = registerSchema.body;
    expect(properties).toHaveProperty('firstName');
    expect(properties).toHaveProperty('lastName');
  });

  it('sets additionalProperties: false to prevent mass-assignment via the body', () => {
    expect(registerSchema.body.additionalProperties).toBe(false);
  });

  it('defines a 201 response schema (register returns Created, not OK)', () => {
    expect(registerSchema.response[201]).toBeDefined();
  });
});

describe('loginSchema', () => {
  it('requires email and password', () => {
    const required = loginSchema.body.required as readonly string[];
    expect(required).toContain('email');
    expect(required).toContain('password');
  });

  it('sets additionalProperties: false on the body', () => {
    expect(loginSchema.body.additionalProperties).toBe(false);
  });

  it('defines a 200 response schema with user and token', () => {
    const { properties } = loginSchema.response[200];
    expect(properties).toHaveProperty('user');
    expect(properties).toHaveProperty('token');
  });
});

describe('verifySchema', () => {
  it('defines a 200 response schema with userId and email', () => {
    const { properties } = verifySchema.response[200];
    expect(properties).toHaveProperty('userId');
    expect(properties).toHaveProperty('email');
  });
});
