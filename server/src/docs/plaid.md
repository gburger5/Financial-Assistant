# Plaid Integration

This document covers the Plaid service layer, its API routes, and the unit test suite.

---

## Overview

[Plaid](https://plaid.com) is a third-party financial data platform. This application uses it to:

1. Authenticate users with their bank through Plaid Link (an embeddable UI widget).
2. Exchange the one-time token from that authentication for a permanent `accessToken`.
3. Pull the last 30 days of settled transactions for analysis.

All Plaid logic lives in two files:

- `src/lib/plaid.ts` — singleton `PlaidApi` client, configured from environment variables.
- `src/services/plaid.ts` — the three service functions used by route handlers.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PLAID_CLIENT_ID` | Your app's client ID from the Plaid developer dashboard |
| `PLAID_SECRET` | Environment-specific secret (use the **sandbox** secret for development) |
| `PLAID_ENV` | `sandbox`, `development`, or `production` (default: `sandbox`) |

The `PlaidApi` client in `src/lib/plaid.ts` reads these at startup and sets the correct `basePath` via `PlaidEnvironments[env]`.

---

## Service Functions

### `createLinkToken(userId: string): Promise<string>`

**File:** `src/services/plaid.ts:8`

Calls Plaid's `linkTokenCreate` endpoint to generate a short-lived token the frontend needs to open Plaid Link.

Parameters sent to Plaid:
- `user.client_user_id` — the authenticated user's UUID (ties the Link session to the user)
- `client_name` — `"Financial Assistant"`
- `products` — `["transactions"]`
- `country_codes` — `["US"]`
- `language` — `"en"`

Returns only the `link_token` string. The token is short-lived; the frontend must open Plaid Link immediately after receiving it.

---

### `exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }>`

**File:** `src/services/plaid.ts:21`

After the user completes Plaid Link, the widget fires `onSuccess` with a one-time `public_token`. This function exchanges it for the long-lived credentials needed to pull data.

- `accessToken` — used in all future API calls for this bank connection. Stored encrypted-at-rest in DynamoDB under the user's `plaidItems` list.
- `itemId` — Plaid's identifier for the bank connection (Item). Stored alongside `accessToken`.

The raw Plaid response also includes `request_id` and other metadata; only `access_token` and `item_id` are extracted and returned.

---

### `syncTransactions(accessToken: string): Promise<PlaidTransaction[]>`

**File:** `src/services/plaid.ts:44`

Fetches all settled transactions for a linked bank account using Plaid's cursor-based `/transactions/sync` endpoint.

**Behavior:**
- Requests up to 500 transactions per page, iterating until `has_more` is `false`.
- The look-back window is controlled by `DAYS_REQUESTED = 30` (line 6).
- Pending transactions (`tx.pending === true`) are silently dropped — only settled transactions are returned.
- If `merchant_name` is null, falls back to `original_description`. If both are null, uses `""`.
- `personal_finance_category` is passed through as-is (or `null` if absent).

**Returns** an array of `PlaidTransaction` objects:

```ts
interface PlaidTransaction {
  transaction_id: string;
  amount: number;          // positive = debit (expense), negative = credit (income)
  date: string;            // YYYY-MM-DD
  merchant_name: string;
  personal_finance_category?: {
    primary: string;       // e.g. "FOOD_AND_DRINK"
    detailed: string;      // e.g. "FOOD_AND_DRINK_GROCERIES"
  } | null;
}
```

---

## API Routes

Both routes are defined in `src/routes/plaid.ts` and require a valid Bearer JWT (`verifyToken` pre-handler).

### `POST /plaid/create-link-token`

Returns a short-lived Plaid Link token for the authenticated user.

**Response:**
```json
{ "link_token": "link-sandbox-..." }
```

### `POST /plaid/exchange-token`

Exchanges a public token, syncs transactions from all linked banks, and triggers budget analysis.

**Request body:**
```json
{ "public_token": "public-sandbox-..." }
```

**Response:**
```json
{
  "budget": { ...Budget },
  "banksConnected": 1
}
```

**What happens internally:**
1. Exchange the new public token → `accessToken` + `itemId`.
2. Fetch `user.plaidItems` for previously linked banks.
3. Sync transactions from **all** banks (existing + new) in parallel via `Promise.all`.
4. Call `analyzeAndPopulateBudget` with the combined transaction set.
5. Return the updated budget and total number of linked banks.

This design means each new bank link re-analyzes all transaction history, keeping the budget estimate accurate across multiple institutions.

---

## Unit Tests

**File:** `src/tests/unit-tests/services/plaid.test.ts`

The test suite mocks `src/lib/plaid.ts` so no real Plaid API calls are made. The mock replaces `plaidClient` with a Vitest mock object:

```ts
vi.mock('../../../lib/plaid.js', () => ({
  plaidClient: {
    linkTokenCreate: vi.fn(),
    itemPublicTokenExchange: vi.fn(),
    transactionsSync: vi.fn(),
  },
}));
```

Each `beforeEach` calls `vi.clearAllMocks()` to reset call counts and return values between tests.

---

### `createLinkToken` tests (5 tests)

| Test | What it verifies |
|------|-----------------|
| Returns the link token | The raw `link_token` string from `response.data` is returned, not the full response object |
| Passes `userId` as `client_user_id` | The user's UUID reaches Plaid correctly |
| Requests the transactions product | `products` array contains `"transactions"` |
| Sets `client_name` | Value is `"Financial Assistant"` |
| Propagates errors | If `linkTokenCreate` rejects, the error bubbles up unchanged |

**What must be true for tests to pass:**
- `createLinkToken` must return `response.data.link_token` directly (not the response object).
- The call to `plaidClient.linkTokenCreate` must include `user: { client_user_id: userId }`, `products`, and `client_name` in its argument.
- No try/catch wrapping that swallows errors inside the service function.

---

### `exchangePublicToken` tests (4 tests)

| Test | What it verifies |
|------|-----------------|
| Returns `accessToken` and `itemId` | Fields are correctly renamed from Plaid's snake_case |
| Passes `public_token` | The token is forwarded verbatim |
| Strips extra fields | Only `{ accessToken, itemId }` are returned |
| Propagates errors | Plaid API errors bubble up |

**What must be true for tests to pass:**
- `exchangePublicToken` must return an object with exactly the keys `accessToken` and `itemId`, mapped from `response.data.access_token` and `response.data.item_id`.
- `itemPublicTokenExchange` must be called with `{ public_token: publicToken }`.

---

### `syncTransactions` tests (11 tests)

| Test | What it verifies |
|------|-----------------|
| Single-page results | Returns all transactions from a one-page response |
| Multi-page pagination | Iterates until `has_more` is `false`, combining all pages |
| Cursor threading | The `next_cursor` from page N is passed as `cursor` to page N+1 |
| Pending filter | Transactions with `pending: true` are excluded from the result |
| `merchant_name` fallback | Falls back to `original_description` when `merchant_name` is `null` |
| Double-null fallback | Uses `""` when both `merchant_name` and `original_description` are `null` |
| `personal_finance_category` pass-through | Category object is preserved on output |
| `personal_finance_category` null | Undefined category is normalized to `null` (not `undefined`) |
| Empty result | Returns `[]` when no transactions are added |
| Access token forwarding | `access_token` is passed to `transactionsSync` |
| Category options flag | `options.include_personal_finance_category: true` is set in the request |
| Error propagation | Plaid errors bubble up |

**What must be true for tests to pass:**
- The `while (hasMore)` loop must continue calling `transactionsSync` as long as `has_more` is `true`, passing the `next_cursor` from the previous response as `cursor`.
- `tx.pending === true` transactions must be skipped before pushing to `allTransactions`.
- `merchant_name` must be resolved as `tx.merchant_name ?? tx.original_description ?? ""`.
- `personal_finance_category` must be set to `tx.personal_finance_category ?? null` (never `undefined`).
- `transactionsSync` must be called with `{ access_token, cursor, count: 500, options: { days_requested: 30, include_personal_finance_category: true } }`.
