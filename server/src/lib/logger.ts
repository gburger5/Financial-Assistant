/**
 * @module logger
 * @description Custom pino logger factory aligned with OpenTelemetry field-naming
 * conventions for structured log aggregation (CloudWatch, Datadog, etc.).
 *
 * Design decisions:
 * - "level" → OTel severity  |  "time" → timestamp  |  "msg" → body
 * - Custom attributes follow OTel namespace.attribute format (http.method, user.id)
 * - base: null removes pid/hostname — meaningless in containers; the orchestrator
 *   tracks that context via labels, not log fields.
 * - Sensitive fields are redacted before the log is written (zero-cost at read time).
 * - Timestamps are always Unix epoch ms for log aggregator compatibility.
 * - In development (non-production without explicit destination), the optional
 *   pino-pretty transport adds human-readable formatting at the terminal only.
 */
import pino, { type DestinationStream, type LoggerOptions } from 'pino';

/**
 * Creates a configured pino logger.
 *
 * When `destination` is provided the logger writes raw newline-delimited JSON
 * to that stream — no transport is added. This overload is used in tests so
 * output can be captured and parsed without a real TTY.
 *
 * When `destination` is omitted the logger writes to stdout. In non-production
 * environments pino-pretty is applied as a transport for human-readable output.
 *
 * @param {DestinationStream} [destination] - Optional custom write destination.
 *   Pass a Writable stream to capture output in tests.
 * @returns {pino.Logger} A fully configured pino logger instance.
 */
export function createLogger(destination?: DestinationStream): pino.Logger {
  // Evaluate isDev at call time (not module load time) so tests can control
  // NODE_ENV before calling createLogger() and get predictable behaviour.
  const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

  // Silence output during tests unless the caller provides an explicit
  // destination stream (the logger unit tests do this to capture JSON output).
  const isTest = process.env.NODE_ENV === 'test' && !destination;

  const options: LoggerOptions = {
    level: isTest ? 'silent' : 'info',

    // Remove pid and hostname from every log line. In a containerised environment
    // these fields are redundant — the orchestrator tracks per-container context
    // via labels, not embedded log fields.
    base: null,

    // Log aggregators (CloudWatch, Datadog) expect epoch-ms numbers, not ISO strings.
    // pino.stdTimeFunctions.epochTime emits ,"time":<Date.now()> into each record.
    timestamp: pino.stdTimeFunctions.epochTime,

    // Redact sensitive fields using JSONPath-style paths. Redaction runs BEFORE
    // the log is written so secrets never reach any transport or stream.
    // Covers both top-level and one-level-nested occurrences of each key.
    redact: {
      paths: [
        'password',
        'token',
        'accessToken',
        'authorization',
        'refreshToken',
        '*.password',
        '*.token',
        '*.accessToken',
        '*.authorization',
        '*.refreshToken',
      ],
      censor: '[REDACTED]',
    },

    serializers: {
      /**
       * Serialises the incoming HTTP request using OTel HTTP semantic conventions.
       * https://opentelemetry.io/docs/specs/semconv/http/http-spans/
       *
       * @param {any} request - Raw request object from Fastify / light-my-request.
       * @returns {Record<string, unknown>}
       */
      req(request) {
        return {
          'http.method': request.method,
          'http.url': request.url,
          'http.host': request.hostname,
          'http.user_agent': request.headers?.['user-agent'],
        };
      },

      /**
       * Serialises the outgoing HTTP response using OTel HTTP semantic conventions.
       *
       * @param {any} reply - Reply object from Fastify.
       * @returns {Record<string, unknown>}
       */
      res(reply) {
        return {
          'http.status_code': reply.statusCode,
        };
      },

      /**
       * Serialises errors with OTel-friendly fields.
       * Stack traces are included in development to aid debugging but suppressed
       * in production to avoid leaking internal implementation details.
       *
       * @param {any} error - Any thrown value.
       * @returns {Record<string, unknown>}
       */
      err(error) {
        return {
          type: error.constructor.name,
          message: error.message,
          // Include stack only in dev — captured via closure over isDev so the
          // decision matches the environment at logger-creation time.
          stack: isDev ? error.stack : undefined,
          // AppError subclasses carry a statusCode; include it when present.
          statusCode: (error as Record<string, unknown>).statusCode,
        };
      },
    },
  };

  // When an explicit destination is provided (e.g. in tests), write raw JSON
  // directly. No transport is added — pino-pretty would race with the stream.
  if (destination) {
    return pino(options, destination);
  }

  // Tests use level: silent above, so no output reaches any transport.
  // isDev is already false in test mode, so pino-pretty is never spawned.
  if (isDev) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          // pino-pretty adds its own human-readable timestamp; suppress the
          // raw epoch-ms field to avoid duplication.
          translateTime: 'SYS:standard',
          colorize: true,
        },
      },
    });
  }

  return pino(options);
}
