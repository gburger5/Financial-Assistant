/**
 * @module errors
 * @description Custom error hierarchy for the application.
 * Each class encodes its own HTTP status code so route handlers and the
 * global error handler need no if/else chains to decide what to return.
 *
 * All classes set `isOperational = true` so the error handler can
 * distinguish expected domain errors from unexpected crashes and avoid
 * leaking internal detail to clients.
 */

/**
 * @class AppError
 * @description Base class for all operational application errors.
 * Extends the native Error so it can be caught by generic `catch` blocks
 * while still carrying HTTP-specific metadata.
 */
export class AppError extends Error {
  /** HTTP status code to send to the client. */
  readonly statusCode: number;

  /**
   * Always `true` for AppError subclasses. The global error handler uses
   * this flag to decide whether it is safe to forward the message to the
   * client. Non-operational (unexpected) errors should never reach the
   * client with their real message.
   */
  readonly isOperational: boolean = true;

  /**
   * @param {number} statusCode - HTTP status code for this error.
   * @param {string} message - Human-readable error detail.
   */
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    // Restore the prototype chain so instanceof checks work correctly after
    // TypeScript compiles `extends Error` down to ES5.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
  }
}

/**
 * @class BadRequestError
 * @description 400 — Malformed request or failed business-rule validation
 * (e.g. passwords don't match, field too short) that JSON Schema didn't
 * already catch at the framework level.
 */
export class BadRequestError extends AppError {
  /** @param {string} message - Description of what was wrong with the request. */
  constructor(message: string) {
    super(400, message);
  }
}

/**
 * @class UnauthorizedError
 * @description 401 — The caller is not authenticated. Throw when there is
 * no token, the token is expired, or the token signature is invalid.
 */
export class UnauthorizedError extends AppError {
  /** @param {string} message - Reason authentication failed. */
  constructor(message: string) {
    super(401, message);
  }
}

/**
 * @class ForbiddenError
 * @description 403 — The caller is authenticated but is not allowed to
 * perform this action (e.g. accessing another user's resource).
 */
export class ForbiddenError extends AppError {
  /** @param {string} message - Reason access was denied. */
  constructor(message: string) {
    super(403, message);
  }
}

/**
 * @class NotFoundError
 * @description 404 — The requested resource does not exist.
 * Per CLAUDE.md security rules, also use this (not 403) when a resource
 * exists but the caller lacks permission, to prevent resource enumeration.
 */
export class NotFoundError extends AppError {
  /** @param {string} message - Description of the missing resource. */
  constructor(message: string) {
    super(404, message);
  }
}

/**
 * @class ConflictError
 * @description 409 — The request conflicts with current state
 * (e.g. email already registered, duplicate Plaid item).
 */
export class ConflictError extends AppError {
  /** @param {string} message - Description of the conflict. */
  constructor(message: string) {
    super(409, message);
  }
}

/**
 * @class ServiceUnavailableError
 * @description 503 — An external dependency is unavailable
 * (e.g. Plaid API is down, DynamoDB is unreachable).
 */
export class ServiceUnavailableError extends AppError {
  /** @param {string} message - Description of the unavailable service. */
  constructor(message: string) {
    super(503, message);
  }
}
