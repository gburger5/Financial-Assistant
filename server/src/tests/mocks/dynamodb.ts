import { vi } from 'vitest';
import { mockDb } from './db.js';

vi.mock('../../lib/db.js', () => ({
  db: {
    send: async (command: any) => {
      const name = command.constructor.name;
        
        // Login flow
        if (name === 'PutCommand') {
        const item = command.input.Item;

        mockDb.createSession(item.tokenId);

        return {};
      }

      // Verify flow
      if (name === 'GetCommand') {
        const tokenId = command.input.Key.tokenId;
        const session = mockDb.getSession(tokenId);

        if (!session) {
          return { Item: undefined };
        }

        return {
          Item: {
            tokenId: session.tokenId,
            revoked: session.revoked,
            expiresAt: session.expiresAt ?? Math.floor(Date.now() / 1000) + 9999,
          },
        };
      }

      // Logout flow
      if (name === 'UpdateCommand') {
        const tokenId = command.input.Key.tokenId;

        mockDb.revokeSession(tokenId);

        return {};
      }

      throw new Error(`Unhandled DynamoDB command in test: ${name}`);
    },
  },
}));