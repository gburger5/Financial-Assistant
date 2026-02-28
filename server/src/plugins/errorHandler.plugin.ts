/**
 * @module errorHandler.plugin
 * @description Global Fastify error handler plugin.
 *
 * Catches every error thrown anywhere in the application and returns a
 * consistent JSON shape:
 *   { "statusCode": 404, "error": "Not Found", "message": "Budget not found" }
 *
 * Rules:
 * - AppError (isOperational === true) → use its statusCode and message.
 * - Any other error → 500 with "Internal Server Error" (real message is never
 *   sent to the client to prevent leaking implementation details).
 * - Unmatched routes → 404 with the same shape via setNotFoundHandler.
 *
 * Wrapped with fastify-plugin so the handlers escape the plugin's encapsulated
 * scope and apply to the entire application instance.
 */
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.js';

/**
 * Maps HTTP status codes to their standard reason phrases.
 * Covers the codes produced by AppError subclasses plus 500.
 */
const STATUS_PHRASES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

/**
 * Returns the reason phrase for a given status code, falling back to
 * "Internal Server Error" for any code not in the map.
 *
 * @param {number} statusCode
 * @returns {string}
 */
function reasonPhrase(statusCode: number): string {
  return STATUS_PHRASES[statusCode] ?? 'Internal Server Error';
}

/**
 * Registers the global error handler and not-found handler on the Fastify
 * instance. Uses fastify-plugin to prevent scope encapsulation so the
 * handlers apply to all routes in the app, not just routes registered inside
 * this plugin's scope.
 *
 * @param {FastifyInstance} fastify
 * @returns {Promise<void>}
 */
async function errorHandlerPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler(
    /**
     * Handles all errors thrown by route handlers.
     *
     * @param {Error} error - The thrown error.
     * @param {FastifyRequest} _request
     * @param {FastifyReply} reply
     */
    (error, _request: FastifyRequest, reply: FastifyReply) => {
      // Operational AppError — our domain errors with known status codes.
      // Use error.name (set to the constructor name in AppError's base constructor,
      // e.g. "ConflictError") rather than the generic HTTP reason phrase so that
      // callers can distinguish error classes without parsing the message string.
      if (error instanceof AppError && error.isOperational) {
        const statusCode = error.statusCode;
        return reply.status(statusCode).send({
          statusCode,
          error: error.name,
          message: error.message,
        });
      }

      // Fastify framework errors (e.g. schema validation failures).
      // These carry a numeric statusCode set by Fastify itself; forward them
      // with the standard shape so clients receive 400 instead of 500.
      if (
        error instanceof Error &&
        'statusCode' in error &&
        typeof (error as { statusCode: unknown }).statusCode === 'number'
      ) {
        const nativeStatus = (error as { statusCode: number }).statusCode;
        if (nativeStatus >= 400 && nativeStatus < 500) {
          return reply.status(nativeStatus).send({
            statusCode: nativeStatus,
            error: reasonPhrase(nativeStatus),
            message: error.message,
          });
        }
      }

      // Unexpected crash — log the real error server-side, never expose it.
      fastify.log.error(error, 'Unexpected error');
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal Server Error',
      });
    }
  );

  fastify.setNotFoundHandler(
    /**
     * Handles requests that do not match any registered route.
     * Returns the same consistent shape as the error handler.
     *
     * @param {FastifyRequest} request
     * @param {FastifyReply} reply
     */
    (request: FastifyRequest, reply: FastifyReply) => {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Route ${request.method}:${request.url} not found`,
      });
    }
  );
}

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
  fastify: '5.x',
});
