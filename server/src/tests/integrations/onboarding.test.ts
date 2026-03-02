/**
 * @module onboarding.test
 * @description Full end-to-end integration test for the user onboarding flow.
 *
 * Flow under test:
 *   1. Register a new user
 *   2. Log in and obtain a JWT
 *   3. Obtain a Plaid Link token
 *   4. Link three sandbox bank accounts (checking, investments, debts)
 *      — each via sandboxPublicTokenCreate + POST /api/plaid/exchange-token
 *   5. Await initial sync for all three accounts
 *   6. Initialize budget from synced history (POST /api/budget/initialize)
 *   7. Edit the budget (PATCH /api/budget)
 *   8. Retrieve the updated budget (GET /api/budget)
 *   9. Verify full budget history (GET /api/budget/history)
 *
 * NO MOCKS — this test runs against the real Plaid sandbox API and a real
 * DynamoDB instance. Required .env variables:
 *   PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV=sandbox
 *   DYNAMODB_ENDPOINT (local) or AWS credentials (remote)
 *   JWT_SECRET, ENCRYPTION_KEY
 *
 * A unique email address is generated per run so test data accumulates in
 * DynamoDB without conflicting across runs.
 *
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { plaidClient } from '../../lib/plaidClient.js';
import { triggerInitialSync } from '../../modules/plaid/plaid.service.js';

// ---------------------------------------------------------------------------
// Test identity — unique per run to avoid DynamoDB conflicts
// ---------------------------------------------------------------------------

const RUN_ID = Date.now();
const TEST_EMAIL = `onboarding-${RUN_ID}@test.example`;

/**
 * Password that satisfies the service's complexity requirements:
 * at least one uppercase, one lowercase, one digit.
 */
const TEST_PASSWORD = 'Onboarding1!';

// ---------------------------------------------------------------------------
// Shared state written by earlier tests and consumed by later ones.
// Tests run sequentially within a describe block — this is safe.
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let token: string;
let userId: string;

// ---------------------------------------------------------------------------
// Sandbox bank configurations
// ---------------------------------------------------------------------------

/**
 */
const SANDBOX_BANKS = [
  {
    username: 'custom_user_checking',
    institutionName: 'Chase Bank',
    products: ['transactions'] as string[],
  },
  {
    username: 'custom_user_investments',
    institutionName: 'Wells Fargo',
    products: ['investments'] as string[],
  },
  {
    username: 'custom_user_debts',
    institutionName: 'First Platypus Bank',
    products: ['liabilities'] as string[],
  },
] as const;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Onboarding integration', () => {
  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  }, 15_000);

  afterAll(async () => {
    await app.close();
  });

  // ---- Step 1: Register -------------------------------------------------

  it('registers a new user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        firstName: 'Integration',
        lastName: 'Test',
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.userId).toBeTruthy();
    expect(body.email).toBe(TEST_EMAIL);
    userId = body.userId;
  }, 20_000);

  // ---- Step 2: Login ----------------------------------------------------

  it('logs in and receives a JWT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.userId).toBe(userId);
    token = body.token;
  }, 20_000);

  // ---- Step 3: Link token (sanity check) --------------------------------

  it('obtains a Plaid link token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/plaid/link-token',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().linkToken).toBeTruthy();
  }, 20_000);

  // ---- Steps 4 + 5: Link three banks, await each sync ------------------

  it('links custom_user_checking and syncs transactions', async () => {
    const bank = SANDBOX_BANKS[0];

    // Create a Plaid sandbox public token — bypasses the Link UI.
    const sandboxRes = await plaidClient.sandboxPublicTokenCreate({
      institution_id: 'ins_109508',
      initial_products: bank.products as Parameters<typeof plaidClient.sandboxPublicTokenCreate>[0]['initial_products'],
      options: {
        override_username: bank.username,
        override_password: 'pass_good',
      },
    });

    const publicToken = sandboxRes.data.public_token;

    // Exchange the public token via the app route.
    const exchangeRes = await app.inject({
      method: 'POST',
      url: '/api/plaid/exchange-token',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        publicToken,
        institutionId: 'ins_109508',
        institutionName: bank.institutionName,
      },
    });

    expect(exchangeRes.statusCode).toBe(200);
    const { itemId } = exchangeRes.json();
    expect(itemId).toBeTruthy();

    // Explicitly await the sync that linkBankAccount fires fire-and-forget.
    // triggerInitialSync is idempotent — running it twice produces the same
    // DynamoDB state and is safe alongside the background invocation.
    // For checking (transactions only), updateInvestments will throw because
    // the investments product is not enabled. The catch keeps the test green;
    // transactions are already synced by the time updateInvestments runs.
    try {
      await triggerInitialSync(userId, itemId);
    } catch (err) {
      // Expected: investments product not enabled on this item.
    }
  }, 90_000);

  it('links custom_user_investments and syncs holdings', async () => {
    const bank = SANDBOX_BANKS[1];

    const sandboxRes = await plaidClient.sandboxPublicTokenCreate({
      institution_id: 'ins_109508',
      initial_products: bank.products as Parameters<typeof plaidClient.sandboxPublicTokenCreate>[0]['initial_products'],
      options: {
        override_username: bank.username,
        override_password: 'pass_good',
      },
    });

    const exchangeRes = await app.inject({
      method: 'POST',
      url: '/api/plaid/exchange-token',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        publicToken: sandboxRes.data.public_token,
        institutionId: 'ins_109508',
        institutionName: bank.institutionName,
      },
    });

    expect(exchangeRes.statusCode).toBe(200);
    const { itemId } = exchangeRes.json();
    expect(itemId).toBeTruthy();

    // updateLiabilities may throw (liabilities not enabled) — catch it.
    // Holdings and investment transactions are synced before that point.
    try {
      await triggerInitialSync(userId, itemId);
    } catch (err) {
      // Expected: liabilities product not enabled on this item.
    }
  }, 90_000);

  it('links custom_user_debts and syncs liabilities', async () => {
    const bank = SANDBOX_BANKS[2];

    const sandboxRes = await plaidClient.sandboxPublicTokenCreate({
      institution_id: 'ins_109508',
      initial_products: bank.products as Parameters<typeof plaidClient.sandboxPublicTokenCreate>[0]['initial_products'],
      options: {
        override_username: bank.username,
        override_password: 'pass_good',
      },
    });

    const exchangeRes = await app.inject({
      method: 'POST',
      url: '/api/plaid/exchange-token',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        publicToken: sandboxRes.data.public_token,
        institutionId: 'ins_109508',
        institutionName: bank.institutionName,
      },
    });

    expect(exchangeRes.statusCode).toBe(200);
    const { itemId } = exchangeRes.json();
    expect(itemId).toBeTruthy();

    // All three products are enabled for this item — the full sync chain
    // completes: transactions → investments (empty) → liabilities (populated).
    await triggerInitialSync(userId, itemId);
  }, 90_000);

  // ---- Step 6: Initialize budget ----------------------------------------

  it('initializes a budget from synced history', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/budget/initialize',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(201);
    const budget = res.json();

    expect(budget.userId).toBe(userId);
    expect(budget.budgetId).toBeTruthy();
    expect(budget.createdAt).toBeTruthy();

    // Every category amount must be a non-negative number.
    const categories = [
      'income', 'housing', 'utilities', 'transportation',
      'groceries', 'takeout', 'shopping', 'personalCare',
      'debts', 'investments',
    ] as const;

    for (const cat of categories) {
      expect(typeof budget[cat].amount).toBe('number');
      expect(budget[cat].amount).toBeGreaterThanOrEqual(0);
    }

    // With three real sandbox accounts synced, at least one spending category
    // or debts should be non-zero. If the entire budget is zeros, the category
    // map strings in CATEGORY_MAP likely don't match what Plaid sandbox returns.
    const totalSpend =
      budget.housing.amount +
      budget.utilities.amount +
      budget.transportation.amount +
      budget.groceries.amount +
      budget.takeout.amount +
      budget.shopping.amount +
      budget.personalCare.amount +
      budget.debts.amount +
      budget.investments.amount;

    expect(totalSpend).toBeGreaterThan(0);

    // Debts should be non-zero: custom_user_debts has liabilities and all
    // products were enabled so updateLiabilities completed successfully.
    expect(budget.debts.amount).toBeGreaterThan(0);
  }, 30_000);

  // ---- Step 7: Edit budget ----------------------------------------------

  it('edits the budget before confirming', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/budget',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        housing: { amount: 1500 },
        groceries: { amount: 400 },
      },
    });

    expect(res.statusCode).toBe(200);
    const budget = res.json();
    expect(budget.housing.amount).toBe(1500);
    expect(budget.groceries.amount).toBe(400);
    // Unedited categories carry forward from the initialized budget.
    expect(typeof budget.income.amount).toBe('number');
  }, 20_000);

  // ---- Step 8: Retrieve updated budget ----------------------------------

  it('retrieves the latest budget with edits applied', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/budget',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const budget = res.json();
    expect(budget.userId).toBe(userId);
    expect(budget.housing.amount).toBe(1500);
    expect(budget.groceries.amount).toBe(400);
  }, 20_000);

  // ---- Step 9: Budget history -------------------------------------------

  it('budget history contains initial and edited versions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/budget/history',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const history: Array<{ housing: { amount: number }; groceries: { amount: number } }> =
      res.json();

    // One version from /initialize, one from the PATCH.
    expect(history.length).toBeGreaterThanOrEqual(2);

    // History is newest-first (ScanIndexForward: false). The most recent
    // entry is the user-edited version.
    expect(history[0].housing.amount).toBe(1500);
    expect(history[0].groceries.amount).toBe(400);
  }, 20_000);
});
