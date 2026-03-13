/**
 * @module auth.schema.test
 * @description Smoke tests for all auth JSON schemas and route-generic types.
 * Guards against shape regressions: removed required fields, missing
 * additionalProperties guards, wrong response codes, etc.
 * Covers the original schemas and the new logout/refresh/forgot/reset/delete additions.
 */
import { describe, it, expect } from 'vitest';
import {
  publicUserSchema,
  registerSchema,
  loginSchema,
  verifySchema,
  resendVerificationSchema,
  verifyEmailSchema,
  updateNameSchema,
  updatePasswordSchema,
  updateEmailSchema,
  logoutSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  deleteAccountSchema,
} from '../auth.schema.js';

// ---------------------------------------------------------------------------
// publicUserSchema
// ---------------------------------------------------------------------------

describe('publicUserSchema', () => {
  it('declares userId, email, and createdAt properties', () => {
    const { properties } = publicUserSchema;
    expect(properties).toHaveProperty('userId');
    expect(properties).toHaveProperty('email');
    expect(properties).toHaveProperty('createdAt');
  });

  it('declares firstName and lastName properties', () => {
    const { properties } = publicUserSchema;
    expect(properties).toHaveProperty('firstName');
    expect(properties).toHaveProperty('lastName');
  });
});

// ---------------------------------------------------------------------------
// registerSchema
// ---------------------------------------------------------------------------

describe('registerSchema', () => {
  it('requires email, password, and confirmPassword', () => {
    const required = registerSchema.body.required as readonly string[];
    expect(required).toContain('email');
    expect(required).toContain('password');
    expect(required).toContain('confirmPassword');
  });

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

  it('enforces minLength: 10 on password', () => {
    const prop = registerSchema.body.properties.password as { minLength: number };
    expect(prop.minLength).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// loginSchema
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// verifySchema
// ---------------------------------------------------------------------------

describe('verifySchema', () => {
  it('defines a 200 response schema with userId and email', () => {
    const { properties } = verifySchema.response[200];
    expect(properties).toHaveProperty('userId');
    expect(properties).toHaveProperty('email');
  });
});

// ---------------------------------------------------------------------------
// resendVerificationSchema
// ---------------------------------------------------------------------------

describe('resendVerificationSchema', () => {
  it('requires email', () => {
    const required = resendVerificationSchema.body.required as readonly string[];
    expect(required).toContain('email');
  });

  it('sets additionalProperties: false on the body', () => {
    expect((resendVerificationSchema.body as unknown as Record<string, unknown>).additionalProperties).toBe(false);
  });

  it('defines a 200 response schema', () => {
    expect(resendVerificationSchema.response[200]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// verifyEmailSchema
// ---------------------------------------------------------------------------

describe('verifyEmailSchema', () => {
  it('defines a querystring schema with a required token field', () => {
    const schema = verifyEmailSchema as Record<string, unknown>;
    expect(schema).toHaveProperty('querystring');
    const qs = schema.querystring as { properties: Record<string, unknown>; required: string[] };
    expect(qs.properties).toHaveProperty('token');
    expect(qs.required).toContain('token');
  });
});

// ---------------------------------------------------------------------------
// updateNameSchema
// ---------------------------------------------------------------------------

describe('updateNameSchema', () => {
  it('requires firstName and lastName', () => {
    const required = updateNameSchema.body.required as readonly string[];
    expect(required).toContain('firstName');
    expect(required).toContain('lastName');
  });

  it('sets additionalProperties: false on the body', () => {
    expect(updateNameSchema.body.additionalProperties).toBe(false);
  });

  it('defines a 200 response schema', () => {
    expect(updateNameSchema.response[200]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// updatePasswordSchema
// ---------------------------------------------------------------------------

describe('updatePasswordSchema', () => {
  it('requires currentPassword, newPassword, and confirmNewPassword', () => {
    const required = updatePasswordSchema.body.required as readonly string[];
    expect(required).toContain('currentPassword');
    expect(required).toContain('newPassword');
    expect(required).toContain('confirmNewPassword');
  });

  it('sets additionalProperties: false on the body', () => {
    expect(updatePasswordSchema.body.additionalProperties).toBe(false);
  });

  it('enforces minLength: 10 on newPassword', () => {
    const prop = updatePasswordSchema.body.properties.newPassword as { minLength: number };
    expect(prop.minLength).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// updateEmailSchema
// ---------------------------------------------------------------------------

describe('updateEmailSchema', () => {
  it('requires newEmail and currentPassword', () => {
    const required = updateEmailSchema.body.required as readonly string[];
    expect(required).toContain('newEmail');
    expect(required).toContain('currentPassword');
  });

  it('sets additionalProperties: false on the body', () => {
    expect(updateEmailSchema.body.additionalProperties).toBe(false);
  });

  it('validates newEmail format', () => {
    const prop = updateEmailSchema.body.properties.newEmail as { format: string };
    expect(prop.format).toBe('email');
  });
});

// ---------------------------------------------------------------------------
// logoutSchema
// ---------------------------------------------------------------------------

describe('logoutSchema', () => {
  it('defines a 200 response schema with a success boolean', () => {
    const { properties } = logoutSchema.response[200];
    expect(properties).toHaveProperty('success');
    expect((properties.success as { type: string }).type).toBe('boolean');
  });

  it('requires refreshToken in the request body so it can be revoked server-side', () => {
    const schema = logoutSchema as Record<string, unknown>;
    const body = schema.body as { required: string[]; properties: Record<string, unknown> };
    expect(body).toBeDefined();
    expect(body.required).toContain('refreshToken');
    expect(body.properties).toHaveProperty('refreshToken');
  });
});

// ---------------------------------------------------------------------------
// refreshSchema
// ---------------------------------------------------------------------------

describe('refreshSchema', () => {
  it('requires refreshToken in the body', () => {
    const required = refreshSchema.body.required as readonly string[];
    expect(required).toContain('refreshToken');
  });

  it('sets additionalProperties: false on the body', () => {
    expect(refreshSchema.body.additionalProperties).toBe(false);
  });

  it('defines a 200 response schema with accessToken and refreshToken', () => {
    const { properties } = refreshSchema.response[200];
    expect(properties).toHaveProperty('accessToken');
    expect(properties).toHaveProperty('refreshToken');
  });

  it('enforces minLength: 1 on refreshToken', () => {
    const prop = refreshSchema.body.properties.refreshToken as { minLength: number };
    expect(prop.minLength).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// forgotPasswordSchema
// ---------------------------------------------------------------------------

describe('forgotPasswordSchema', () => {
  it('requires email in the body', () => {
    const required = forgotPasswordSchema.body.required as readonly string[];
    expect(required).toContain('email');
  });

  it('sets additionalProperties: false on the body', () => {
    expect(forgotPasswordSchema.body.additionalProperties).toBe(false);
  });

  it('validates email format', () => {
    const emailProp = forgotPasswordSchema.body.properties.email as { format: string };
    expect(emailProp.format).toBe('email');
  });

  it('defines a 200 response schema with a success boolean', () => {
    const { properties } = forgotPasswordSchema.response[200];
    expect(properties).toHaveProperty('success');
  });
});

// ---------------------------------------------------------------------------
// resetPasswordSchema
// ---------------------------------------------------------------------------

describe('resetPasswordSchema', () => {
  it('requires token, newPassword, and confirmNewPassword', () => {
    const required = resetPasswordSchema.body.required as readonly string[];
    expect(required).toContain('token');
    expect(required).toContain('newPassword');
    expect(required).toContain('confirmNewPassword');
  });

  it('sets additionalProperties: false on the body', () => {
    expect(resetPasswordSchema.body.additionalProperties).toBe(false);
  });

  it('enforces minLength: 10 on newPassword', () => {
    const prop = resetPasswordSchema.body.properties.newPassword as { minLength: number };
    expect(prop.minLength).toBe(10);
  });

  it('enforces minLength: 1 on token', () => {
    const prop = resetPasswordSchema.body.properties.token as { minLength: number };
    expect(prop.minLength).toBe(1);
  });

  it('defines a 200 response schema with a success boolean', () => {
    const { properties } = resetPasswordSchema.response[200];
    expect(properties).toHaveProperty('success');
  });
});

// ---------------------------------------------------------------------------
// deleteAccountSchema
// ---------------------------------------------------------------------------

describe('deleteAccountSchema', () => {
  it('requires currentPassword', () => {
    const required = deleteAccountSchema.body.required as readonly string[];
    expect(required).toContain('currentPassword');
  });

  it('sets additionalProperties: false on the body', () => {
    expect(deleteAccountSchema.body.additionalProperties).toBe(false);
  });

  it('enforces minLength: 10 on currentPassword', () => {
    const prop = deleteAccountSchema.body.properties.currentPassword as { minLength: number };
    expect(prop.minLength).toBe(10);
  });

  it('defines a 200 response schema with a success boolean', () => {
    const { properties } = deleteAccountSchema.response[200];
    expect(properties).toHaveProperty('success');
  });
});