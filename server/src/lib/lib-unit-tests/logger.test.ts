/**
 * @module logger.test
 * @description Unit tests for the custom pino logger factory.
 * Tests cover OTel-aligned field names, sensitive-field redaction,
 * custom serializers, and epoch-ms timestamps.
 *
 * Tests exercise createLogger(destination) — the overload that writes to an
 * in-memory stream so we can parse and assert on the emitted JSON without
 * needing a real TTY or pino-pretty.
 */
import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import { createLogger } from '../logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a synchronous in-memory writable stream and a helper that parses
 * every newline-delimited JSON log line emitted to it.
 *
 * @returns {{ stream: Writable, getLines: () => Record<string, unknown>[] }}
 */
function makeStream(): {
  stream: Writable;
  getLines: () => Record<string, unknown>[];
} {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString().trim());
      cb();
    },
  });
  return {
    stream,
    getLines: () =>
      chunks
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

// ---------------------------------------------------------------------------
// createLogger — base config
// ---------------------------------------------------------------------------

describe('createLogger — base config', () => {
  it('returns a pino logger with info, warn, error, and debug methods', () => {
    const { stream } = makeStream();
    const logger = createLogger(stream);
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('omits pid and hostname from every log line (base: null)', () => {
    const { stream, getLines } = makeStream();
    const logger = createLogger(stream);
    logger.info('test message');
    const [line] = getLines();
    expect(line).not.toHaveProperty('pid');
    expect(line).not.toHaveProperty('hostname');
  });

  it('includes level and msg in every log line', () => {
    const { stream, getLines } = makeStream();
    const logger = createLogger(stream);
    logger.info('hello world');
    const [line] = getLines();
    expect(line).toHaveProperty('level');
    expect(line).toHaveProperty('msg', 'hello world');
  });
});

// ---------------------------------------------------------------------------
// createLogger — timestamps
// ---------------------------------------------------------------------------

describe('createLogger — timestamps', () => {
  it('emits time as a Unix epoch millisecond number', () => {
    const { stream, getLines } = makeStream();
    const before = Date.now();
    const logger = createLogger(stream);
    logger.info('ts test');
    const after = Date.now();
    const [line] = getLines();
    expect(typeof line.time).toBe('number');
    expect(line.time as number).toBeGreaterThanOrEqual(before);
    expect(line.time as number).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// createLogger — redaction
// ---------------------------------------------------------------------------

describe('createLogger — redaction', () => {
  it('redacts password at top level', () => {
    const { stream, getLines } = makeStream();
    const logger = createLogger(stream);
    logger.info({ password: 'secret123' }, 'login attempt');
    const [line] = getLines();
    expect(line.password).toBe('[REDACTED]');
  });

  it('redacts token at top level', () => {
    const { stream, getLines } = makeStream();
    const logger = createLogger(stream);
    logger.info({ token: 'abc.def.ghi' }, 'token event');
    const [line] = getLines();
    expect(line.token).toBe('[REDACTED]');
  });

  it('redacts accessToken at top level', () => {
    const { stream, getLines } = makeStream();
    const logger = createLogger(stream);
    logger.info({ accessToken: 'plaid-access-token' }, 'plaid event');
    const [line] = getLines();
    expect(line.accessToken).toBe('[REDACTED]');
  });

  it('redacts authorization at top level', () => {
    const { stream, getLines } = makeStream();
    const logger = createLogger(stream);
    logger.info({ authorization: 'Bearer xyz' }, 'auth event');
    const [line] = getLines();
    expect(line.authorization).toBe('[REDACTED]');
  });

  it('redacts refreshToken at top level', () => {
    const { stream, getLines } = makeStream();
    const logger = createLogger(stream);
    logger.info({ refreshToken: 'refresh-abc' }, 'token refresh');
    const [line] = getLines();
    expect(line.refreshToken).toBe('[REDACTED]');
  });
});

// ---------------------------------------------------------------------------
// createLogger — serializers
// ---------------------------------------------------------------------------

describe('createLogger — req serializer', () => {
  it('maps request fields to OTel HTTP semantic conventions', () => {
    const { stream, getLines } = makeStream();
    const logger = createLogger(stream);
    logger.info(
      {
        req: {
          method: 'GET',
          url: '/api/users',
          hostname: 'localhost',
          headers: { 'user-agent': 'vitest/1.0' },
        },
      },
      'incoming'
    );
    const [line] = getLines();
    const req = line.req as Record<string, unknown>;
    expect(req['http.method']).toBe('GET');
    expect(req['http.url']).toBe('/api/users');
    expect(req['http.host']).toBe('localhost');
    expect(req['http.user_agent']).toBe('vitest/1.0');
  });
});

describe('createLogger — res serializer', () => {
  it('maps statusCode to http.status_code', () => {
    const { stream, getLines } = makeStream();
    const logger = createLogger(stream);
    logger.info({ res: { statusCode: 201 } }, 'response');
    const [line] = getLines();
    const res = line.res as Record<string, unknown>;
    expect(res['http.status_code']).toBe(201);
  });
});

describe('createLogger — err serializer', () => {
  it('includes constructor name, message, and statusCode', () => {
    const { stream, getLines } = makeStream();
    const logger = createLogger(stream);
    const err = Object.assign(new Error('resource not found'), {
      statusCode: 404,
    });
    logger.error({ err }, 'request error');
    const [line] = getLines();
    const errField = line.err as Record<string, unknown>;
    expect(errField.type).toBe('Error');
    expect(errField.message).toBe('resource not found');
    expect(errField.statusCode).toBe(404);
  });

  it('omits stack trace in production', () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const { stream, getLines } = makeStream();
      // createLogger() reads NODE_ENV at call time
      const logger = createLogger(stream);
      logger.error({ err: new Error('prod boom') }, 'prod error');
      const [line] = getLines();
      const errField = line.err as Record<string, unknown>;
      expect(errField).not.toHaveProperty('stack');
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('includes stack trace in development', () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      const { stream, getLines } = makeStream();
      const logger = createLogger(stream);
      logger.error({ err: new Error('dev boom') }, 'dev error');
      const [line] = getLines();
      const errField = line.err as Record<string, unknown>;
      expect(errField).toHaveProperty('stack');
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
