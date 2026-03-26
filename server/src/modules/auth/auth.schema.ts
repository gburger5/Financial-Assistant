/**
 * @module auth.schema
 * @description Fastify route schemas and TypeScript route-generic interfaces
 * for the auth module.
 *
 * Response schemas act as a whitelist — fields not declared here are stripped
 * by fast-json-stringify before the response is sent, so `password_hash` can
 * never leak even if a full UserRecord is accidentally passed to reply.send().
 */

// ---------------------------------------------------------------------------
// TypeScript route-generic interfaces (used in controller function signatures)
// ---------------------------------------------------------------------------

/**
 * Route generics for POST /register.
 * `confirmPassword` is validated at the controller layer (business rule),
 * not via JSON Schema, because JSON Schema cannot express cross-field equality.
 */
export interface RegisterRouteGeneric {
  Body: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
}

/** Route generics for PATCH /profile. */
export interface UpdateProfileRouteGeneric {
  Body: {
    birthday: string;
  };
}

/** Route generics for POST /login. */
export interface LoginRouteGeneric {
  Body: {
    email: string;
    password: string;
  };
}

// ---------------------------------------------------------------------------
// Reusable sub-schemas
// ---------------------------------------------------------------------------

/**
 * JSON Schema for a PublicUser — the shape returned to callers.
 * Does NOT include password_hash, plaidItems, or any internal field.
 */
export const publicUserSchema = {
  type: 'object',
  properties: {
    userId: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    email: { type: 'string' },
    createdAt: { type: 'string' },
    agentBudgetApproved: { type: 'boolean' },
    birthday: { type: 'string' },
  },
} as const;

// ---------------------------------------------------------------------------
// Route schemas
// ---------------------------------------------------------------------------

/**
 * Schema for POST /register.
 * Body requires email, password (min 10 chars), and confirmPassword.
 * Responds 201 with a PublicUser on success.
 */
export const registerSchema = {
  body: {
    type: 'object',
    required: ['firstName', 'lastName', 'email', 'password', 'confirmPassword'],
    additionalProperties: false,
    properties: {
      firstName: { type: 'string', minLength: 1 },
      lastName: { type: 'string', minLength: 1 },
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 10 },
      confirmPassword: { type: 'string', minLength: 10 },
    },
  },
  response: {
    201: publicUserSchema,
  },
} as const;

/**
 * Schema for POST /login.
 * Responds 200 with a token string and a PublicUser.
 */
export const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 10 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        user: publicUserSchema,
        token: { type: 'string' },
      },
    },
  },
} as const;

/**
 * Schema for GET /verify.
 * No request body. Responds 200 with the decoded JWT payload fields.
 */
export const verifySchema = {
  response: {
    200: publicUserSchema,
  },
} as const;

/**
 * Schema for PATCH /profile.
 * Body requires a birthday string in YYYY-MM-DD format.
 * Responds 200 with the updated PublicUser.
 */
export const updateProfileSchema = {
  body: {
    type: 'object',
    required: ['birthday'],
    additionalProperties: false,
    properties: {
      birthday: { type: 'string', format: 'date' },
    },
  },
  response: {
    200: publicUserSchema,
  },
} as const;
