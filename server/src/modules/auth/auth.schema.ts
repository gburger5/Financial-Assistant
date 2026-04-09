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
 * Password has no minLength here, enforcement is at registration.
 * Any credential mismatch returns 401 from the service layer.
 */
export const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 1 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        user: publicUserSchema,
        token: { type: 'string' },
        refreshToken: { type: 'string' },
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

/**
 * Schema for GET /verify-email.
 * No request body. Expects a `token` query parameter. Responds 200 with a
 * success boolean.
 */
export const verifyEmailSchema = {
  querystring: {
    type: 'object',
    required: ['token'],
    properties: {
      token: { type: 'string' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  },
} as const;

export interface ResendVerificationRouteGeneric {
  Body: {
    email: string;
  };
}

/**
 * Schema for POST /resend-verification.
 * Body requires email. Responds 200 with a success boolean.
 */
export const resendVerificationSchema = {
  body: {
    type: 'object',
    required: ['email'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  },
} as const;

export interface UpdateNameRouteGeneric {
  Body: {
    firstName: string;
    lastName: string;
  };
}

export interface UpdatePasswordRouteGeneric {
  Body: {
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
  };
}

export interface UpdateEmailRouteGeneric {
  Body: {
    newEmail: string;
    currentPassword: string;
  };
}

export const updateNameSchema = {
  body: {
    type: 'object',
    required: ['firstName', 'lastName'],
    additionalProperties: false,
    properties: {
      firstName: { type: 'string', minLength: 1 },
      lastName: { type: 'string', minLength: 1 },
    },
  },
  response: {
    200: publicUserSchema,
  },
} as const;

export const updatePasswordSchema = {
  body: {
    type: 'object',
    required: ['currentPassword', 'newPassword', 'confirmNewPassword'],
    additionalProperties: false,
    properties: {
      currentPassword: { type: 'string', minLength: 10 },
      newPassword: { type: 'string', minLength: 10 },
      confirmNewPassword: { type: 'string', minLength: 10 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  },
} as const;

export const updateEmailSchema = {
  body: {
    type: 'object',
    required: ['newEmail', 'currentPassword'],
    additionalProperties: false,
    properties: {
      newEmail: { type: 'string', format: 'email' },
      currentPassword: { type: 'string', minLength: 10 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  },
} as const;

/** Route generics for POST /logout. */
export interface LogoutRouteGeneric {
  Body: {
    refreshToken: string;
  };
}

/**
 * Schema for POST /logout.
 * Body requires the opaque refreshToken so it can be deleted server-side,
 * preventing token reuse after logout. The access token is revoked via the
 * Authorization header (verifyJWT preHandler). Responds 200 with a success boolean.
 */
export const logoutSchema = {
  body: {
    type: 'object',
    required: ['refreshToken'],
    additionalProperties: false,
    properties: {
      refreshToken: { type: 'string', minLength: 1 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  },
} as const;

/** Route generics for POST /refresh. */
export interface RefreshRouteGeneric {
  Body: {
    refreshToken: string;
  };
}

/**
 * Schema for POST /refresh.
 * Body requires the opaque refreshToken string issued at login.
 * Responds 200 with a new access token and a rotated refresh token.
 */
export const refreshSchema = {
  body: {
    type: 'object',
    required: ['refreshToken'],
    additionalProperties: false,
    properties: {
      refreshToken: { type: 'string', minLength: 1 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
      },
    },
  },
} as const;

/** Route generics for POST /forgot-password. */
export interface ForgotPasswordRouteGeneric {
  Body: {
    email: string;
  };
}

/** Route generics for POST /reset-password. */
export interface ResetPasswordRouteGeneric {
  Body: {
    token: string;
    newPassword: string;
    confirmNewPassword: string;
  };
}

/**
 * Schema for POST /forgot-password.
 * Accepts an email address and always responds 200 (to prevent enumeration).
 */
export const forgotPasswordSchema = {
  body: {
    type: 'object',
    required: ['email'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  },
} as const;

/**
 * Schema for POST /reset-password.
 * Requires the reset token, the new password, and a confirmation field.
 * Responds 200 with a success boolean on valid token + matching passwords.
 */
export const resetPasswordSchema = {
  body: {
    type: 'object',
    required: ['token', 'newPassword', 'confirmNewPassword'],
    additionalProperties: false,
    properties: {
      token: { type: 'string', minLength: 1 },
      newPassword: { type: 'string', minLength: 10 },
      confirmNewPassword: { type: 'string', minLength: 10 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  },
} as const;

/** Route generics for DELETE /account. */
export interface DeleteAccountRouteGeneric {
  Body: {
    currentPassword: string;
  };
}

/**
 * Schema for DELETE /account.
 * Requires the user's current password as a confirmation step.
 * Responds 200 with a success boolean.
 */
export const deleteAccountSchema = {
  body: {
    type: 'object',
    required: ['currentPassword'],
    additionalProperties: false,
    properties: {
      currentPassword: { type: 'string', minLength: 10 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  },
} as const;
