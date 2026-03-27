/**
 * @module vitest.global-setup
 * @description Vitest globalSetup that ensures DynamoDB Local is running and all
 * tables exist before integration tests execute. Runs once before all test files,
 * not per-file.
 *
 * Lifecycle:
 *   setup()    — start DynamoDB Local container (if not running), wait for it
 *                to accept connections, then create all tables.
 *   teardown() — stop and remove the container (only if we started it).
 */

import { execSync } from 'node:child_process';
import { setupTables } from '../scripts/setup-tables.js';

const CONTAINER_NAME = 'dynamodb-vitest';
const HOST_PORT = '8000';
const ENDPOINT = `http://localhost:${HOST_PORT}`;

/** Maximum time (ms) to wait for DynamoDB Local to accept connections. */
const HEALTH_TIMEOUT_MS = 15_000;
/** Interval (ms) between health-check retries. */
const HEALTH_INTERVAL_MS = 300;

/** Tracks whether this run started the container so teardown knows to stop it. */
let weStartedContainer = false;

/**
 * Returns true if a Docker container with CONTAINER_NAME is already running.
 */
function isContainerRunning(): boolean {
  try {
    const out = execSync(
      `docker ps --filter name=^/${CONTAINER_NAME}$ --format "{{.ID}}"`,
      { encoding: 'utf-8' },
    ).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

/**
 * Removes any stopped container with our name so `docker run` doesn't conflict.
 */
function removeStaleContainer(): void {
  try {
    execSync(`docker rm -f ${CONTAINER_NAME} 2>/dev/null`, { stdio: 'ignore' });
  } catch {
    // no-op — container didn't exist
  }
}

/**
 * Starts DynamoDB Local in a detached Docker container.
 */
function startContainer(): void {
  removeStaleContainer();
  execSync(
    `docker run -d --name ${CONTAINER_NAME} -p ${HOST_PORT}:8000 amazon/dynamodb-local:latest -jar DynamoDBLocal.jar -sharedDb`,
    { stdio: 'ignore' },
  );
  console.log(`[global-setup] Started ${CONTAINER_NAME} container on port ${HOST_PORT}`);
}

/**
 * Polls the DynamoDB endpoint until it responds or the timeout expires.
 *
 * @throws {Error} If the endpoint is not reachable within HEALTH_TIMEOUT_MS.
 */
async function waitForDynamo(): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(ENDPOINT);
      if (res.status === 400 || res.status === 200) {
        // DynamoDB Local returns 400 for a bare GET — that means it's up
        return;
      }
    } catch {
      // connection refused — not ready yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
  }

  throw new Error(
    `[global-setup] DynamoDB Local did not become reachable at ${ENDPOINT} within ${HEALTH_TIMEOUT_MS}ms`,
  );
}

/**
 * Vitest globalSetup hook — runs once before all test files.
 */
export async function setup(): Promise<void> {
  if (!isContainerRunning()) {
    startContainer();
    weStartedContainer = true;
  } else {
    console.log(`[global-setup] ${CONTAINER_NAME} already running — reusing`);
  }

  await waitForDynamo();

  // Ensure DYNAMODB_ENDPOINT is set for setup-tables and for test workers
  process.env.DYNAMODB_ENDPOINT = ENDPOINT;

  await setupTables(ENDPOINT);
}

/**
 * Vitest globalSetup hook — runs once after all test files complete.
 */
export async function teardown(): Promise<void> {
  if (weStartedContainer) {
    try {
      execSync(`docker stop ${CONTAINER_NAME}`, { stdio: 'ignore' });
      execSync(`docker rm ${CONTAINER_NAME}`, { stdio: 'ignore' });
      console.log(`[global-setup] Stopped and removed ${CONTAINER_NAME}`);
    } catch {
      // best-effort cleanup
    }
  }
}
