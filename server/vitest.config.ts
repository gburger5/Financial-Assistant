/**
 * @module vitest.config
 * @description Root Vitest configuration. Picks up all co-located test files
 * throughout src/ (matching the *.test.ts convention) and applies the shared
 * setup file so dotenv is loaded before every test suite.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['src/tests/vitest.setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/*.config.ts'],
    },
  },
});
