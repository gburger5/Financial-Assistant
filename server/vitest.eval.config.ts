/**
 * @module vitest.eval.config
 * @description Vitest configuration for agent evals. Evals hit the real
 * Anthropic API, are slow, and are opt-in — they MUST NOT run in the normal
 * `npm test` path. This config only picks up `*.eval.ts` files, skips the
 * DynamoDB global setup (evals mock the service layer), bumps the test
 * timeout to accommodate real LLM round-trips, and forces sequential
 * execution to stay within Anthropic's per-minute rate limits.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/evals/**/*.eval.ts'],
    exclude: ['node_modules', 'dist'],
    // Load dotenv so ANTHROPIC_API_KEY is available to the agents.
    setupFiles: ['src/tests/vitest.setup.ts'],
    testTimeout: 120_000,
    // Run test files and tests within them one at a time to avoid
    // blowing through the Anthropic API rate limit.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
