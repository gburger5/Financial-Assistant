import './dynamodb.js';
import { vi } from 'vitest';
import { mockDb } from './db.js';

// Export mockDb so it can be imported by helpers
export { mockDb };

// Mock the auth service to use our in-memory DB
vi.mock('../../services/auth.js', () => ({
  registerUser: vi.fn(async (
    firstName: string,
    lastName: string,
    email: string,
    password: string
  ) => {
    return mockDb.registerUser(firstName, lastName, email, password);
  }),

  loginUser: vi.fn(async (email: string, password: string) => {
    return mockDb.loginUser(email, password);
  }),
}));