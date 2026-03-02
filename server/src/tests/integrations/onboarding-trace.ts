import 'dotenv/config';
/**
 * @module onboarding-trace
 * @description Standalone end-to-end trace runner for the user onboarding flow.
 *
 * Run with:  npx tsx src/tests/integrations/onboarding-trace.ts
 *
 * Executes every onboarding step in order, printing:
 *   - The exact HTTP request (method, url, headers, body)
 *   - The exact HTTP response (status, body)
 *   - The decoded JWT payload when a token is issued
 *   - DynamoDB table state (raw rows) after every mutation
 *   - Sync result counts from triggerInitialSync
 *   - Budget computation details from instrumented service logs
 *
 * NO MOCKS. Requires a running DynamoDB local and real Plaid sandbox credentials.
 */

import { buildApp } from '../../app.js';
import { plaidClient } from '../../lib/plaidClient.js';
import { triggerInitialSync } from '../../modules/plaid/plaid.service.js';
import { db } from '../../db/index.js';
import { Tables } from '../../db/tables.js';
import {
  QueryCommand,
  ScanCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import type { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Prints a titled section divider. */
function section(title: string) {
  console.log('\n' + '='.repeat(72));
  console.log(`  ${title}`);
  console.log('='.repeat(72));
}

/** Prints a sub-step label. */
function step(label: string) {
  console.log('\n--- ' + label + ' ---');
}

/** Pretty-prints any value as indented JSON. */
function dump(label: string, value: unknown) {
  console.log(`\n${label}:`);
  console.log(JSON.stringify(value, null, 2));
}

/**
 * Decodes a JWT payload without verifying the signature.
 * Used purely for tracing — never trust a token decoded this way in production.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, b64] = token.split('.');
  return JSON.parse(Buffer.from(b64, 'base64url').toString());
}

// ---------------------------------------------------------------------------
// DynamoDB query helpers (query by userId PK, return all items)
// ---------------------------------------------------------------------------

/** Queries a DynamoDB table by partition key (userId) and returns all items. */
async function queryByUserId(tableName: string, userId: string) {
  const result = await db.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }),
  );
  return result.Items ?? [];
}

/** GetItem for the Users table (PK = id). */
async function getUserRecord(userId: string) {
  const result = await db.send(
    new GetCommand({
      TableName: Tables.Users,
      Key: { id: userId },
    }),
  );
  return result.Item;
}

/** Prints DynamoDB state for all tables relevant to the current step. */
async function printDbState(userId: string, label: string) {
  step(`DynamoDB state — ${label}`);

  const user = await getUserRecord(userId);
  if (user) {
    // Mask the password hash so the trace log is safe to share.
    dump('Users (id=' + userId + ')', { ...user, password_hash: '***' });
  }

  const items = await queryByUserId(Tables.PlaidItems, userId);
  dump(`PlaidItems (${items.length} item(s))`, items.map(i => ({
    ...i,
    encryptedAccessToken: i.encryptedAccessToken ? '<encrypted>' : null,
  })));

  const accounts = await queryByUserId(Tables.Accounts, userId);
  dump(`Accounts (${accounts.length})`, accounts);

  const txQuery = await db.send(new QueryCommand({
    TableName: Tables.Transactions,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ScanIndexForward: false,
    Limit: 5,
  }));
  const txSample = txQuery.Items ?? [];
  const txTotal = await db.send(new QueryCommand({
    TableName: Tables.Transactions,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    Select: 'COUNT',
  }));
  console.log(`\nTransactions: total=${txTotal.Count ?? 0}, showing newest 5:`);
  console.log(JSON.stringify(txSample, null, 2));

  const liabilities = await queryByUserId(Tables.Liabilities, userId);
  dump(`Liabilities (${liabilities.length})`, liabilities);

  const holdings = await queryByUserId(Tables.Holdings, userId);
  console.log(`\nHoldings: ${holdings.length} row(s) (snapshotDate-keyed)`);
  if (holdings.length > 0) {
    console.log(JSON.stringify(holdings.slice(0, 3), null, 2));
    if (holdings.length > 3) console.log(`  ... and ${holdings.length - 3} more`);
  }

  const budgets = await queryByUserId(Tables.Budgets, userId);
  dump(`Budgets (${budgets.length})`, budgets);
}

// ---------------------------------------------------------------------------
// HTTP helper — wraps app.inject() and prints full request + response
// ---------------------------------------------------------------------------

async function inject(
  app: FastifyInstance,
  opts: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    payload?: unknown;
  },
) {
  step(`HTTP ${opts.method} ${opts.url}`);
  if (opts.headers) {
    const maskedHeaders = { ...opts.headers };
    if (maskedHeaders.Authorization) {
      maskedHeaders.Authorization = maskedHeaders.Authorization.slice(0, 30) + '…';
    }
    console.log('Request headers:', JSON.stringify(maskedHeaders));
  }
  if (opts.payload) {
    console.log('Request body:', JSON.stringify(opts.payload, null, 2));
  }

  const res = await app.inject({
    method: opts.method as 'GET' | 'POST' | 'PATCH',
    url: opts.url,
    headers: opts.headers,
    payload: opts.payload as Record<string, unknown> | undefined,
  });

  console.log(`\nResponse: HTTP ${res.statusCode}`);
  console.log('Response body:', JSON.stringify(res.json(), null, 2));
  return res;
}

// ---------------------------------------------------------------------------
// Main trace runner
// ---------------------------------------------------------------------------

async function run() {
  const app = buildApp();
  await app.ready();

  const RUN_ID = Date.now();
  const EMAIL = `trace-${RUN_ID}@example.com`;
  const PASSWORD = 'Onboarding1!';

  console.log('\n');
  section('ONBOARDING FLOW EXECUTION TRACE');
  console.log(`Run ID:    ${RUN_ID}`);
  console.log(`Email:     ${EMAIL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  let userId = '';
  let token = '';

  // ==========================================================================
  // STEP 1: Register
  // ==========================================================================
  section('STEP 1 — Register new user  (POST /api/auth/register)');

  const registerRes = await inject(app, {
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      firstName: 'Trace',
      lastName: 'Runner',
      email: EMAIL,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    },
  });

  if (registerRes.statusCode !== 201) {
    console.error('ABORT: registration failed');
    await app.close();
    process.exit(1);
  }

  userId = registerRes.json().userId;
  console.log(`\nExtracted userId: ${userId}`);

  await printDbState(userId, 'after registration');

  // ==========================================================================
  // STEP 2: Login
  // ==========================================================================
  section('STEP 2 — Login  (POST /api/auth/login)');

  const loginRes = await inject(app, {
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: EMAIL, password: PASSWORD },
  });

  if (loginRes.statusCode !== 200) {
    console.error('ABORT: login failed');
    await app.close();
    process.exit(1);
  }

  token = loginRes.json().token;

  step('JWT payload (decoded, not verified)');
  const jwtPayload = decodeJwtPayload(token);
  dump('JWT payload', jwtPayload);
  console.log(`JWT iat:  ${new Date((jwtPayload.iat as number) * 1000).toISOString()}`);
  console.log(`JWT exp:  ${new Date((jwtPayload.exp as number) * 1000).toISOString()}`);
  console.log(`JWT alg:  HS256 (explicitly specified in jwt.sign call)`);

  // ==========================================================================
  // STEP 3: Obtain Plaid link token
  // ==========================================================================
  section('STEP 3 — Plaid link token  (GET /api/plaid/link-token)');

  const linkTokenRes = await inject(app, {
    method: 'GET',
    url: '/api/plaid/link-token',
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log(`\nLink token (first 40 chars): ${linkTokenRes.json().linkToken?.slice(0, 40)}…`);

  // ==========================================================================
  // STEP 4a: Link checking account (transactions)
  // ==========================================================================
  section('STEP 4a — Link checking account  (sandboxPublicTokenCreate + POST /api/plaid/exchange-token)');

  step('Calling Plaid sandbox: sandboxPublicTokenCreate for custom_user_checking');
  const checkingPublicTokenRes = await plaidClient.sandboxPublicTokenCreate({
    institution_id: 'ins_109508',
    initial_products: ['transactions'],
    options: {
      override_username: 'custom_user_checking',
      override_password: 'pass_good',
    },
  });
  const checkingPublicToken = checkingPublicTokenRes.data.public_token;
  console.log(`Plaid sandbox response: public_token=${checkingPublicToken.slice(0, 40)}…`);

  const exchangeCheckingRes = await inject(app, {
    method: 'POST',
    url: '/api/plaid/exchange-token',
    headers: { Authorization: `Bearer ${token}` },
    payload: {
      publicToken: checkingPublicToken,
      institutionId: 'ins_109508',
      institutionName: 'Chase Bank',
    },
  });

  const checkingItemId = exchangeCheckingRes.json().itemId;
  console.log(`\nChecking item linked: itemId=${checkingItemId}`);

  step('triggerInitialSync (checking): syncTransactions → updateInvestments → updateLiabilities');
  try {
    await triggerInitialSync(userId, checkingItemId);
  } catch (err) {
    console.log(`[expected] updateInvestments or updateLiabilities threw on checking item: ${(err as Error).message}`);
  }

  await printDbState(userId, 'after checking account sync');

  // ==========================================================================
  // STEP 4b: Link investments account
  // ==========================================================================
  section('STEP 4b — Link investments account  (custom_user_investments)');

  step('Calling Plaid sandbox: sandboxPublicTokenCreate for custom_user_investments');
  const investPublicTokenRes = await plaidClient.sandboxPublicTokenCreate({
    institution_id: 'ins_109508',
    initial_products: ['investments'],
    options: {
      override_username: 'custom_user_investments',
      override_password: 'pass_good',
    },
  });
  const investPublicToken = investPublicTokenRes.data.public_token;
  console.log(`Plaid sandbox response: public_token=${investPublicToken.slice(0, 40)}…`);

  const exchangeInvestRes = await inject(app, {
    method: 'POST',
    url: '/api/plaid/exchange-token',
    headers: { Authorization: `Bearer ${token}` },
    payload: {
      publicToken: investPublicToken,
      institutionId: 'ins_109508',
      institutionName: 'Wells Fargo',
    },
  });

  const investItemId = exchangeInvestRes.json().itemId;
  console.log(`\nInvestments item linked: itemId=${investItemId}`);

  step('triggerInitialSync (investments): syncTransactions → updateInvestments → updateLiabilities');
  try {
    await triggerInitialSync(userId, investItemId);
  } catch (err) {
    console.log(`[expected] threw on investments item: ${(err as Error).message}`);
  }

  await printDbState(userId, 'after investments account sync');

  // ==========================================================================
  // STEP 4c: Link liabilities account
  // ==========================================================================
  section('STEP 4c — Link liabilities account  (custom_user_debts)');

  step('Calling Plaid sandbox: sandboxPublicTokenCreate for custom_user_debts');
  const debtPublicTokenRes = await plaidClient.sandboxPublicTokenCreate({
    institution_id: 'ins_109508',
    initial_products: ['liabilities'],
    options: {
      override_username: 'custom_user_debts',
      override_password: 'pass_good',
    },
  });
  const debtPublicToken = debtPublicTokenRes.data.public_token;
  console.log(`Plaid sandbox response: public_token=${debtPublicToken.slice(0, 40)}…`);

  const exchangeDebtRes = await inject(app, {
    method: 'POST',
    url: '/api/plaid/exchange-token',
    headers: { Authorization: `Bearer ${token}` },
    payload: {
      publicToken: debtPublicToken,
      institutionId: 'ins_109508',
      institutionName: 'First Platypus Bank',
    },
  });

  const debtItemId = exchangeDebtRes.json().itemId;
  console.log(`\nLiabilities item linked: itemId=${debtItemId}`);

  step('triggerInitialSync (debts): syncTransactions → updateInvestments → updateLiabilities');
  await triggerInitialSync(userId, debtItemId);

  await printDbState(userId, 'after liabilities account sync (ALL THREE ITEMS SYNCED)');

  // ==========================================================================
  // STEP 5: Initialize budget
  // ==========================================================================
  section('STEP 5 — Initialize budget  (POST /api/budget/initialize)');

  const budgetInitRes = await inject(app, {
    method: 'POST',
    url: '/api/budget/initialize',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (budgetInitRes.statusCode !== 201) {
    console.error('ABORT: budget initialization failed');
    dump('Error response', budgetInitRes.json());
    await app.close();
    process.exit(1);
  }

  const initialBudget = budgetInitRes.json();
  step('Initial budget categories');
  const categories = ['income', 'housing', 'utilities', 'transportation', 'groceries', 'takeout', 'shopping', 'personalCare', 'debts', 'investments'];
  for (const cat of categories) {
    console.log(`  ${cat.padEnd(16)} $${initialBudget[cat].amount}`);
  }

  await printDbState(userId, 'after budget initialization');

  // ==========================================================================
  // STEP 5b: Call initialize again (idempotency check)
  // ==========================================================================
  section('STEP 5b — Budget initialize idempotency check  (POST /api/budget/initialize again)');

  const budgetInit2Res = await inject(app, {
    method: 'POST',
    url: '/api/budget/initialize',
    headers: { Authorization: `Bearer ${token}` },
  });

  const budget2 = budgetInit2Res.json();
  console.log('\nIdempotency check:');
  console.log(`  Same budgetId: ${initialBudget.budgetId === budget2.budgetId}`);
  console.log(`  Same income:   ${initialBudget.income.amount === budget2.income.amount}`);

  const budgetsAfterDoubleInit = await queryByUserId(Tables.Budgets, userId);
  console.log(`\nBudgets table row count after double init: ${budgetsAfterDoubleInit.length} (must be 1)`);

  // ==========================================================================
  // STEP 6: Patch budget
  // ==========================================================================
  section('STEP 6 — Edit budget  (PATCH /api/budget)');

  const patchRes = await inject(app, {
    method: 'PATCH',
    url: '/api/budget',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    payload: {
      housing: { amount: 1500 },
      groceries: { amount: 400 },
    },
  });

  const patchedBudget = patchRes.json();
  step('Patched budget (changed fields)');
  console.log(`  housing.amount:   ${patchedBudget.housing.amount}  (was: ${initialBudget.housing.amount})`);
  console.log(`  groceries.amount: ${patchedBudget.groceries.amount}  (was: ${initialBudget.groceries.amount})`);
  console.log(`  income.amount:    ${patchedBudget.income.amount}  (unchanged, carries forward)`);
  console.log(`  budgetId changed: ${patchedBudget.budgetId !== initialBudget.budgetId}`);

  await printDbState(userId, 'after PATCH budget (2 budget rows expected)');

  // ==========================================================================
  // STEP 7: GET budget (latest)
  // ==========================================================================
  section('STEP 7 — Retrieve latest budget  (GET /api/budget)');

  const getLatestRes = await inject(app, {
    method: 'GET',
    url: '/api/budget',
    headers: { Authorization: `Bearer ${token}` },
  });

  const latestBudget = getLatestRes.json();
  console.log(`\nLatest budget budgetId: ${latestBudget.budgetId}`);
  console.log(`Is the patched version: ${latestBudget.housing.amount === 1500 && latestBudget.groceries.amount === 400}`);

  // ==========================================================================
  // STEP 8: GET budget history
  // ==========================================================================
  section('STEP 8 — Retrieve budget history  (GET /api/budget/history)');

  const historyRes = await inject(app, {
    method: 'GET',
    url: '/api/budget/history',
    headers: { Authorization: `Bearer ${token}` },
  });

  const history = historyRes.json() as Array<{ budgetId: string; housing: { amount: number }; groceries: { amount: number }; createdAt: string }>;
  console.log(`\nHistory entries: ${history.length} (newest first)`);
  history.forEach((h, i) => {
    console.log(`  [${i}] budgetId=${h.budgetId} housing=$${h.housing.amount} groceries=$${h.groceries.amount} createdAt=${h.createdAt}`);
  });

  // ==========================================================================
  // Summary
  // ==========================================================================
  section('TRACE COMPLETE');
  console.log(`userId:          ${userId}`);
  console.log(`Items linked:    3 (checking, investments, liabilities)`);
  console.log(`Budget versions: ${history.length}`);
  console.log(`Trace finished:  ${new Date().toISOString()}\n`);

  await app.close();
}

// Run and handle any unexpected errors.
run().catch((err) => {
  console.error('\nFATAL: trace runner threw:', err);
  process.exit(1);
});
