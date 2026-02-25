/** Unit tests covering plaid service */

import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../../lib/plaid.js', () => ({
  plaidClient: {
    linkTokenCreate: vi.fn(),
    itemPublicTokenExchange: vi.fn(),
    transactionsSync: vi.fn(),
    investmentsTransactionsGet: vi.fn(),
  },
}));

import { plaidClient } from '../../../lib/plaid.js';
import {
  createLinkToken,
  exchangePublicToken,
  syncTransactions,
  syncInvestmentTransactions,
} from '../../../services/plaid.js';

const mockLinkTokenCreate = vi.mocked(plaidClient.linkTokenCreate);
const mockExchangeToken = vi.mocked(plaidClient.itemPublicTokenExchange);
const mockTransactionsSync = vi.mocked(plaidClient.transactionsSync);
const mockInvestmentsTransactionsGet = vi.mocked(plaidClient.investmentsTransactionsGet);

// Minimal Plaid transaction shape used in tests
function makePlaidTx(overrides: object = {}) {
  return {
    transaction_id: 'tx-1',
    amount: 100,
    date: '2025-01-15',
    merchant_name: 'Test Merchant',
    original_description: 'TEST MERCHANT ORIGINAL',
    pending: false,
    personal_finance_category: {
      primary: 'FOOD_AND_DRINK',
      detailed: 'FOOD_AND_DRINK_GROCERIES',
    },
    ...overrides,
  };
}

// Minimal Plaid investment transaction shape used in tests
function makeInvestmentTx(overrides: object = {}) {
  return {
    investment_transaction_id: 'inv-tx-1',
    amount: -500,  // negative = inflow (contribution)
    date: '2025-01-15',
    type: 'transfer',
    subtype: 'contribution',
    name: '401K CONTRIBUTION',
    ...overrides,
  };
}

describe('plaid service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── createLinkToken ──────────────────────────────────────────────────────

  describe('createLinkToken', () => {
    it('returns the link_token from the Plaid API response', async () => {
      mockLinkTokenCreate.mockResolvedValueOnce({
        data: { link_token: 'link-sandbox-abc123' },
      } as never);

      const token = await createLinkToken('user-123');

      expect(token).toBe('link-sandbox-abc123');
    });

    it('passes userId as client_user_id', async () => {
      mockLinkTokenCreate.mockResolvedValueOnce({
        data: { link_token: 'link-token' },
      } as never);

      await createLinkToken('user-xyz');

      expect(mockLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          user: { client_user_id: 'user-xyz' },
        })
      );
    });

    it('requests the transactions product', async () => {
      mockLinkTokenCreate.mockResolvedValueOnce({
        data: { link_token: 'link-token' },
      } as never);

      await createLinkToken('user-123');

      expect(mockLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          products: expect.arrayContaining(['transactions']),
        })
      );
    });

    it('requests the investments product', async () => {
      mockLinkTokenCreate.mockResolvedValueOnce({
        data: { link_token: 'link-token' },
      } as never);

      await createLinkToken('user-123');

      expect(mockLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          products: expect.arrayContaining(['investments']),
        })
      );
    });

    it('sets client_name to "Financial Assistant"', async () => {
      mockLinkTokenCreate.mockResolvedValueOnce({
        data: { link_token: 'link-token' },
      } as never);

      await createLinkToken('user-123');

      expect(mockLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({ client_name: 'Financial Assistant' })
      );
    });

    it('propagates errors from the Plaid API', async () => {
      mockLinkTokenCreate.mockRejectedValueOnce(new Error('Plaid API unavailable'));

      await expect(createLinkToken('user-123')).rejects.toThrow('Plaid API unavailable');
    });
  });

  // ─── exchangePublicToken ──────────────────────────────────────────────────

  describe('exchangePublicToken', () => {
    it('returns accessToken and itemId from the Plaid API', async () => {
      mockExchangeToken.mockResolvedValueOnce({
        data: {
          access_token: 'access-sandbox-token',
          item_id: 'item-001',
        },
      } as never);

      const result = await exchangePublicToken('public-token-abc');

      expect(result.accessToken).toBe('access-sandbox-token');
      expect(result.itemId).toBe('item-001');
    });

    it('calls itemPublicTokenExchange with the provided public_token', async () => {
      mockExchangeToken.mockResolvedValueOnce({
        data: { access_token: 'access-token', item_id: 'item-id' },
      } as never);

      await exchangePublicToken('public-sandbox-xyz');

      expect(mockExchangeToken).toHaveBeenCalledWith({
        public_token: 'public-sandbox-xyz',
      });
    });

    it('does not expose extra fields beyond accessToken and itemId', async () => {
      mockExchangeToken.mockResolvedValueOnce({
        data: {
          access_token: 'access-token',
          item_id: 'item-id',
          request_id: 'req-123',
        },
      } as never);

      const result = await exchangePublicToken('public-token');

      expect(Object.keys(result)).toEqual(['accessToken', 'itemId']);
    });

    it('propagates errors from the Plaid API', async () => {
      mockExchangeToken.mockRejectedValueOnce(new Error('Invalid public token'));

      await expect(exchangePublicToken('bad-token')).rejects.toThrow('Invalid public token');
    });
  });

  // ─── syncTransactions ─────────────────────────────────────────────────────

  describe('syncTransactions', () => {
    it('returns transactions from a single page', async () => {
      mockTransactionsSync.mockResolvedValueOnce({
        data: {
          added: [makePlaidTx({ transaction_id: 'tx-1', amount: 50 })],
          has_more: false,
          next_cursor: 'cursor-end',
        },
      } as never);

      const txs = await syncTransactions('access-token');

      expect(txs).toHaveLength(1);
      expect(txs[0].transaction_id).toBe('tx-1');
      expect(txs[0].amount).toBe(50);
    });

    it('paginates through multiple pages and returns all transactions', async () => {
      mockTransactionsSync
        .mockResolvedValueOnce({
          data: {
            added: [makePlaidTx({ transaction_id: 'tx-1' })],
            has_more: true,
            next_cursor: 'cursor-1',
          },
        } as never)
        .mockResolvedValueOnce({
          data: {
            added: [makePlaidTx({ transaction_id: 'tx-2' })],
            has_more: false,
            next_cursor: 'cursor-2',
          },
        } as never);

      const txs = await syncTransactions('access-token');

      expect(txs).toHaveLength(2);
      expect(mockTransactionsSync).toHaveBeenCalledTimes(2);
    });

    it('passes the cursor from the previous page into the next request', async () => {
      mockTransactionsSync
        .mockResolvedValueOnce({
          data: { added: [], has_more: true, next_cursor: 'cursor-page-1' },
        } as never)
        .mockResolvedValueOnce({
          data: { added: [], has_more: false, next_cursor: 'cursor-page-2' },
        } as never);

      await syncTransactions('access-token');

      expect(mockTransactionsSync).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ cursor: 'cursor-page-1' })
      );
    });

    it('filters out pending transactions', async () => {
      mockTransactionsSync.mockResolvedValueOnce({
        data: {
          added: [
            makePlaidTx({ transaction_id: 'tx-settled', pending: false }),
            makePlaidTx({ transaction_id: 'tx-pending', pending: true }),
          ],
          has_more: false,
          next_cursor: 'cursor',
        },
      } as never);

      const txs = await syncTransactions('access-token');

      expect(txs).toHaveLength(1);
      expect(txs[0].transaction_id).toBe('tx-settled');
    });

    it('falls back to original_description when merchant_name is null', async () => {
      mockTransactionsSync.mockResolvedValueOnce({
        data: {
          added: [
            makePlaidTx({ merchant_name: null, original_description: 'AMAZON MARKETPLACE' }),
          ],
          has_more: false,
          next_cursor: 'cursor',
        },
      } as never);

      const txs = await syncTransactions('access-token');

      expect(txs[0].merchant_name).toBe('AMAZON MARKETPLACE');
    });

    it('uses empty string when both merchant_name and original_description are null', async () => {
      mockTransactionsSync.mockResolvedValueOnce({
        data: {
          added: [makePlaidTx({ merchant_name: null, original_description: null })],
          has_more: false,
          next_cursor: 'cursor',
        },
      } as never);

      const txs = await syncTransactions('access-token');

      expect(txs[0].merchant_name).toBe('');
    });

    it('preserves personal_finance_category on each transaction', async () => {
      const category = { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_GROCERIES' };
      mockTransactionsSync.mockResolvedValueOnce({
        data: {
          added: [makePlaidTx({ personal_finance_category: category })],
          has_more: false,
          next_cursor: 'cursor',
        },
      } as never);

      const txs = await syncTransactions('access-token');

      expect(txs[0].personal_finance_category).toEqual(category);
    });

    it('sets personal_finance_category to null when not provided', async () => {
      mockTransactionsSync.mockResolvedValueOnce({
        data: {
          added: [makePlaidTx({ personal_finance_category: undefined })],
          has_more: false,
          next_cursor: 'cursor',
        },
      } as never);

      const txs = await syncTransactions('access-token');

      expect(txs[0].personal_finance_category).toBeNull();
    });

    it('returns an empty array when there are no transactions', async () => {
      mockTransactionsSync.mockResolvedValueOnce({
        data: { added: [], has_more: false, next_cursor: 'cursor' },
      } as never);

      const txs = await syncTransactions('access-token');

      expect(txs).toEqual([]);
    });

    it('calls transactionsSync with the provided access token', async () => {
      mockTransactionsSync.mockResolvedValueOnce({
        data: { added: [], has_more: false, next_cursor: 'cursor' },
      } as never);

      await syncTransactions('access-sandbox-xyz');

      expect(mockTransactionsSync).toHaveBeenCalledWith(
        expect.objectContaining({ access_token: 'access-sandbox-xyz' })
      );
    });

    it('requests personal finance categories in the options', async () => {
      mockTransactionsSync.mockResolvedValueOnce({
        data: { added: [], has_more: false, next_cursor: 'cursor' },
      } as never);

      await syncTransactions('access-token');

      expect(mockTransactionsSync).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            include_personal_finance_category: true,
          }),
        })
      );
    });

    it('propagates errors from the Plaid API', async () => {
      mockTransactionsSync.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      await expect(syncTransactions('access-token')).rejects.toThrow('Rate limit exceeded');
    });
  });

  // ─── syncInvestmentTransactions ───────────────────────────────────────────

  describe('syncInvestmentTransactions', () => {
    it('returns investment transactions from the Plaid API', async () => {
      mockInvestmentsTransactionsGet.mockResolvedValueOnce({
        data: {
          investment_transactions: [makeInvestmentTx()],
        },
      } as never);

      const txs = await syncInvestmentTransactions('access-token');

      expect(txs).toHaveLength(1);
      expect(txs[0].investment_transaction_id).toBe('inv-tx-1');
      expect(txs[0].amount).toBe(-500);
      expect(txs[0].type).toBe('transfer');
      expect(txs[0].subtype).toBe('contribution');
      expect(txs[0].name).toBe('401K CONTRIBUTION');
    });

    it('returns an empty array when there are no investment transactions', async () => {
      mockInvestmentsTransactionsGet.mockResolvedValueOnce({
        data: { investment_transactions: [] },
      } as never);

      const txs = await syncInvestmentTransactions('access-token');

      expect(txs).toEqual([]);
    });

    it('calls investmentsTransactionsGet with the provided access token', async () => {
      mockInvestmentsTransactionsGet.mockResolvedValueOnce({
        data: { investment_transactions: [] },
      } as never);

      await syncInvestmentTransactions('access-sandbox-invest');

      expect(mockInvestmentsTransactionsGet).toHaveBeenCalledWith(
        expect.objectContaining({ access_token: 'access-sandbox-invest' })
      );
    });

    it('passes a 30-day date range (start_date and end_date)', async () => {
      mockInvestmentsTransactionsGet.mockResolvedValueOnce({
        data: { investment_transactions: [] },
      } as never);

      const before = new Date();
      await syncInvestmentTransactions('access-token');
      const after = new Date();

      const call = mockInvestmentsTransactionsGet.mock.calls[0][0] as {
        start_date: string;
        end_date: string;
      };

      const startDate = new Date(call.start_date);
      const endDate = new Date(call.end_date);
      const expectedStart = new Date(before.getTime() - 30 * 24 * 60 * 60 * 1000);

      // end_date should be today
      expect(endDate.toISOString().split('T')[0]).toBe(after.toISOString().split('T')[0]);

      // start_date should be ~30 days ago (within 1 day tolerance for test timing)
      const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
      expect(daysDiff).toBe(30);

      // sanity: start is before or equal to expected
      expect(startDate.getTime()).toBeGreaterThanOrEqual(expectedStart.getTime() - 24 * 60 * 60 * 1000);
    });

    it('returns [] for PRODUCTS_NOT_SUPPORTED error (account has no investment access)', async () => {
      const err = { response: { data: { error_code: 'PRODUCTS_NOT_SUPPORTED' } } };
      mockInvestmentsTransactionsGet.mockRejectedValueOnce(err);

      const txs = await syncInvestmentTransactions('access-token');

      expect(txs).toEqual([]);
    });

    it('returns [] for NO_INVESTMENT_ACCOUNTS error', async () => {
      const err = { response: { data: { error_code: 'NO_INVESTMENT_ACCOUNTS' } } };
      mockInvestmentsTransactionsGet.mockRejectedValueOnce(err);

      const txs = await syncInvestmentTransactions('access-token');

      expect(txs).toEqual([]);
    });

    it('propagates unexpected errors from the Plaid API', async () => {
      mockInvestmentsTransactionsGet.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(syncInvestmentTransactions('access-token')).rejects.toThrow('Network timeout');
    });
  });
});
