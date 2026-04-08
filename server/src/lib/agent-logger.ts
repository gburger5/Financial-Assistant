/**
 * @module agent-logger
 * @description Singleton pino logger for the agents module. On first access
 * it also wires the Strands Agents SDK into the same pino pipeline (via
 * `configureLogging`) so SDK-internal warnings/errors — and, at debug level,
 * tool registration and event-loop cycle traces — land in our structured log
 * stream instead of going to stdout unformatted.
 *
 * Kept in a sibling file (rather than inside `logger.ts`) so that importing
 * the base logger does not drag in the Strands SDK for unrelated callers.
 */
import type pino from 'pino';
import { configureLogging } from '@strands-agents/sdk';
import { createLogger } from './logger.js';

// Module-level cache — configureLogging must only run once per process,
// and every agent invocation should share the same root logger so that
// child-bound correlation ids stay comparable in aggregation tools.
let rootAgentLogger: pino.Logger | null = null;

/**
 * Returns the module-level pino logger used for all agent-layer logging.
 *
 * On first call, creates the logger via the shared factory and registers a
 * child (bound to `{ component: 'strands-sdk' }`) as the Strands SDK's
 * global logger. Subsequent calls return the same instance.
 *
 * @returns {pino.Logger} The shared agent root logger.
 */
export function getAgentLogger(): pino.Logger {
  if (!rootAgentLogger) {
    rootAgentLogger = createLogger();
    // Pino child loggers satisfy the SDK's structural Logger interface
    // (debug/info/warn/error). Cast is safe — verified against the SDK's
    // published `Logger` type in @strands-agents/sdk/logging/types.d.ts.
    configureLogging(rootAgentLogger.child({ component: 'strands-sdk' }));
  }
  return rootAgentLogger;
}
