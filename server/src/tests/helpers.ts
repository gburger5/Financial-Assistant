import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';
import { mockDb } from './mocks/db.js';

let app: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = buildApp();
    await app.ready();
  }
  return app;
}

export async function closeApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}

export function generateUniqueEmail(): string {
  return `test${Date.now()}${Math.random()}@example.com`;
}

export function clearMockDb(): void {
  mockDb.clear();
}