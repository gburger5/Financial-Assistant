/**
 * @module hooks.test
 * @description Integration tests for the Fastify lifecycle hooks module.
 * Verifies that onRequest, preHandler, onResponse, and onError hooks
 * correctly seed and emit the consolidated per-request log context.
 *
 * Uses a real pino logger writing to an in-memory stream so we can parse
 * and assert on the structured JSON output without a real HTTP server.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Writable } from 'node:stream';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerHooks } from '../hooks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a synchronous in-memory writable stream and a helper to parse
 * every JSON log line written to it.
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

/**
 * Builds a minimal Fastify instance with:
 * - A pino logger capturing output to an in-memory stream
 * - disableRequestLogging: true (we emit our own consolidated log)
 * - A fixed genReqId for deterministic requestId assertions
 * - All lifecycle hooks from registerHooks()
 * - Any additional routes/hooks provided via the optional setup callback
 *
 * @param setup - Optional callback to register routes or extra hooks before ready()
 */
async function buildTestApp(
  setup?: (app: FastifyInstance) => void
): Promise<{ app: FastifyInstance; getLines: () => Record<string, unknown>[] }> {
  const { stream, getLines } = makeStream();
  // Passing stream via logger options: Fastify's internal pino factory extracts
  // opts.stream and forwards it to pino(opts, opts.stream), so our in-memory
  // writable captures all output without needing to pass a pino instance directly.
  // This avoids the FastifyInstance<Logger<...>> vs FastifyInstance<FastifyBaseLogger>
  // generics mismatch that occurs when using loggerInstance.
  const app = Fastify({
    logger: { level: 'trace', base: null, stream } as any,
    // Suppress Fastify's automatic "incoming request" / "request completed" logs;
    // our onResponse hook emits the single consolidated log instead.
    disableRequestLogging: true,
    // Fixed request ID so assertions on requestId are deterministic.
    genReqId: () => 'test-req-id',
  });

  registerHooks(app);
  setup?.(app);
  await app.ready();
  return { app, getLines };
}

// ---------------------------------------------------------------------------
// onRequest hook
// ---------------------------------------------------------------------------

describe('onRequest hook', () => {
  let app: FastifyInstance;

  afterEach(() => app?.close());

  it('initialises req.startTime as a BigInt for nanosecond-precision timing', async () => {
    ({ app } = await buildTestApp((a) => {
      // Cannot JSON-serialise a BigInt directly — return typeof instead.
      a.get('/test', async (req) => ({ startTimeType: typeof req.startTime }));
    }));

    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
    expect(res.json().startTimeType).toBe('bigint');
  });

  it('seeds logContext with http.method, http.url, and requestId', async () => {
    ({ app } = await buildTestApp((a) => {
      a.get('/test', async (req) => ({ logContext: req.logContext }));
    }));

    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
    const { logContext } = res.json();
    expect(logContext['http.method']).toBe('GET');
    expect(logContext['http.url']).toBe('/test');
    expect(logContext.requestId).toBe('test-req-id');
  });
});

// ---------------------------------------------------------------------------
// preHandler hook
// ---------------------------------------------------------------------------

describe('preHandler hook', () => {
  let app: FastifyInstance;

  afterEach(() => app?.close());

  it('adds user.id to logContext when req.user is populated by the time preHandler runs', async () => {
    ({ app } = await buildTestApp((a) => {
      // Set req.user in a second onRequest hook (runs after registerHooks' onRequest
      // which seeds logContext) so it is available when the global preHandler fires.
      a.addHook('onRequest', async (req) => {
        (req as any).user = {
          userId: 'user-abc123',
          email: 'alice@example.com',
          firstName: 'Alice',
          lastName: 'Smith',
          jti: 'jti-1',
        };
      });
      a.get('/authed', async (req) => ({ logContext: req.logContext }));
    }));

    const res = await app.inject({ method: 'GET', url: '/authed' });
    expect(res.statusCode).toBe(200);
    // userId present — never email (PII)
    expect(res.json().logContext['user.id']).toBe('user-abc123');
    expect(res.json().logContext).not.toHaveProperty('user.email');
  });

  it('does not add user.id to logContext when the route is unauthenticated', async () => {
    ({ app } = await buildTestApp((a) => {
      a.get('/public', async (req) => ({ logContext: req.logContext }));
    }));

    const res = await app.inject({ method: 'GET', url: '/public' });
    expect(res.statusCode).toBe(200);
    expect(res.json().logContext).not.toHaveProperty('user.id');
  });
});

// ---------------------------------------------------------------------------
// onResponse hook — consolidated log
// ---------------------------------------------------------------------------

describe('onResponse hook', () => {
  let app: FastifyInstance;

  afterEach(() => app?.close());

  it('emits exactly one log line per request containing method, url, status, and duration', async () => {
    let getLines!: () => Record<string, unknown>[];
    ({ app, getLines } = await buildTestApp((a) => {
      a.get('/logged', async () => ({ ok: true }));
    }));

    await app.inject({ method: 'GET', url: '/logged' });

    const lines = getLines();
    // Exactly one log: the consolidated onResponse log
    expect(lines).toHaveLength(1);
    const log = lines[0];
    expect(log['http.method']).toBe('GET');
    expect(log['http.url']).toBe('/logged');
    expect(log['http.status_code']).toBe(200);
    expect(typeof log['http.duration_ms']).toBe('number');
    expect(log['http.duration_ms'] as number).toBeGreaterThanOrEqual(0);
  });

  it('includes requestId in the consolidated response log', async () => {
    let getLines!: () => Record<string, unknown>[];
    ({ app, getLines } = await buildTestApp((a) => {
      a.get('/id-test', async () => ({}));
    }));

    await app.inject({ method: 'GET', url: '/id-test' });

    const [log] = getLines();
    expect(log.requestId).toBe('test-req-id');
  });

  it('carries user.id into the consolidated log when the request was authenticated', async () => {
    let getLines!: () => Record<string, unknown>[];
    ({ app, getLines } = await buildTestApp((a) => {
      a.addHook('onRequest', async (req) => {
        (req as any).user = {
          userId: 'user-xyz',
          email: 'bob@example.com',
          firstName: 'Bob',
          lastName: 'Jones',
          jti: 'jti-2',
        };
      });
      a.get('/authed-log', async () => ({ ok: true }));
    }));

    await app.inject({ method: 'GET', url: '/authed-log' });

    const [log] = getLines();
    expect(log['user.id']).toBe('user-xyz');
  });
});

// ---------------------------------------------------------------------------
// onError hook
// ---------------------------------------------------------------------------

describe('onError hook', () => {
  let app: FastifyInstance;

  afterEach(() => app?.close());

  it('adds error context to logContext so the onResponse log contains it', async () => {
    let getLines!: () => Record<string, unknown>[];
    ({ app, getLines } = await buildTestApp((a) => {
      a.get('/fail', async () => {
        throw new Error('something went wrong');
      });
    }));

    await app.inject({ method: 'GET', url: '/fail' });

    const logs = getLines();
    // Both onError (immediate) and onResponse (consolidated) logs are emitted.
    // The onResponse log is the last one and should carry error context.
    const responseLogs = logs.filter(
      (l) => l['http.status_code'] !== undefined
    );
    expect(responseLogs).toHaveLength(1);
    const responseLog = responseLogs[0];
    expect(responseLog['error.type']).toBeDefined();
    expect(responseLog['error.message']).toBe('something went wrong');
  });

  it('emits an immediate error log in addition to the onResponse log', async () => {
    let getLines!: () => Record<string, unknown>[];
    ({ app, getLines } = await buildTestApp((a) => {
      a.get('/fail2', async () => {
        throw new Error('boom');
      });
    }));

    await app.inject({ method: 'GET', url: '/fail2' });

    // At least two logs: the immediate error log + the consolidated response log
    expect(getLines().length).toBeGreaterThanOrEqual(2);
  });
});
