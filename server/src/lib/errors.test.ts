/**
 * @module errors.test
 * @description Unit tests for custom AppError hierarchy.
 */
import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
} from './errors.js';

describe('AppError', () => {
  it('is an instance of Error', () => {
    const err = new AppError(418, "I'm a teapot");
    expect(err).toBeInstanceOf(Error);
  });

  it('sets statusCode, message, and isOperational', () => {
    const err = new AppError(418, "I'm a teapot");
    expect(err.statusCode).toBe(418);
    expect(err.message).toBe("I'm a teapot");
    expect(err.isOperational).toBe(true);
  });
});

describe('BadRequestError', () => {
  it('has statusCode 400', () => {
    const err = new BadRequestError('bad input');
    expect(err.statusCode).toBe(400);
  });

  it('sets message correctly', () => {
    const err = new BadRequestError('passwords do not match');
    expect(err.message).toBe('passwords do not match');
  });

  it('has isOperational true', () => {
    expect(new BadRequestError('x').isOperational).toBe(true);
  });

  it('is an instance of AppError', () => {
    expect(new BadRequestError('x')).toBeInstanceOf(AppError);
  });
});

describe('UnauthorizedError', () => {
  it('has statusCode 401', () => {
    expect(new UnauthorizedError('no token').statusCode).toBe(401);
  });

  it('has isOperational true', () => {
    expect(new UnauthorizedError('x').isOperational).toBe(true);
  });

  it('is an instance of AppError', () => {
    expect(new UnauthorizedError('x')).toBeInstanceOf(AppError);
  });
});

describe('ForbiddenError', () => {
  it('has statusCode 403', () => {
    expect(new ForbiddenError('not yours').statusCode).toBe(403);
  });

  it('has isOperational true', () => {
    expect(new ForbiddenError('x').isOperational).toBe(true);
  });

  it('is an instance of AppError', () => {
    expect(new ForbiddenError('x')).toBeInstanceOf(AppError);
  });
});

describe('NotFoundError', () => {
  it('has statusCode 404', () => {
    expect(new NotFoundError('budget not found').statusCode).toBe(404);
  });

  it('has isOperational true', () => {
    expect(new NotFoundError('x').isOperational).toBe(true);
  });

  it('is an instance of AppError', () => {
    expect(new NotFoundError('x')).toBeInstanceOf(AppError);
  });
});

describe('ConflictError', () => {
  it('has statusCode 409', () => {
    expect(new ConflictError('email already registered').statusCode).toBe(409);
  });

  it('has isOperational true', () => {
    expect(new ConflictError('x').isOperational).toBe(true);
  });

  it('is an instance of AppError', () => {
    expect(new ConflictError('x')).toBeInstanceOf(AppError);
  });
});

describe('ServiceUnavailableError', () => {
  it('has statusCode 503', () => {
    expect(new ServiceUnavailableError('Plaid is down').statusCode).toBe(503);
  });

  it('has isOperational true', () => {
    expect(new ServiceUnavailableError('x').isOperational).toBe(true);
  });

  it('is an instance of AppError', () => {
    expect(new ServiceUnavailableError('x')).toBeInstanceOf(AppError);
  });
});
