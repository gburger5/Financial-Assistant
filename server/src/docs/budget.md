# Budget Service

This document covers the budget data model, the transaction-to-budget category mapping, all service functions, the API routes, and the unit test suite.

---

## Overview

A budget is a single DynamoDB item in the `Budgets` table that stores estimated monthly spending across several categories. Budgets are created automatically when a user links their first bank account, populated by analyzing Plaid transaction history, reviewed and edited by the user, and then confirmed to complete onboarding.

Each budget belongs to exactly one user and cannot be accessed or modified by any other user — all queries are scoped by `userId`, which is derived from the verified JWT on every request.

---

## Data Model

```ts
interface Budget {
  userId: string;              // DynamoDB hash key
  budgetId: string;            // DynamoDB sort key — format: "budget#<ULID>"
  createdAt: string;           // ISO 8601 timestamp, set once at creation
  updatedAt: string;           // ISO 8601 timestamp, updated on every write
  name: string;                // Always "Monthly Budget"
  status: "PENDING" | "REVIEWED" | "CONFIRMED";
  income: {
    monthlyNet: number | null;
  };
  needs: {
    housing: {
      rentOrMortgage: number | null;
    };
    utilities: {
      utilities: number | null;   // Gas, electric, water, internet, phone combined
    };
    transportation: {
      carPayment: number | null;
      gasFuel: number | null;
    };
    other: {
      groceries: number | null;
      personalCare: number | null;
    };
  };
  wants: {
    takeout: number | null;
    shopping: number | null;
  };
}
```

All numeric fields start as `null`. A `null` value means no transaction data was found for that category during analysis. The user can manually enter a value during review.

**`budgetId` format:** `budget#<ULID>` — the `#` character is the URL fragment separator and **must be percent-encoded** (`%23`) when used in any HTTP path. Always use `encodeURIComponent(budgetId)` in frontend code.

---

## Budget Lifecycle

```
        created            user saves          user confirms
[no budget] → PENDING → → → REVIEWED → → → → CONFIRMED
                  ↑                                |
              re-analyzed                     (terminal)
           (new bank linked)
```

- **`PENDING`** — created by `analyzeAndPopulateBudget`. Fields may be null or auto-populated from transactions. The user has not yet reviewed this version.
- **`REVIEWED`** — set by `updateBudget` whenever a user saves changes. The budget has been seen and potentially edited by the user.
- **`CONFIRMED`** — terminal state set by `confirmBudget`. The budget is locked; `onboarding.budgetConfirmed` is set to `true` on the user record.

If the user links a new bank after reviewing, `analyzeAndPopulateBudget` rewrites the budget fields and resets `status` back to `"PENDING"`, prompting the user to re-review with the combined data.

---

## Category Mapping

Transaction analysis uses Plaid's [Personal Finance Category (PFCv2)](https://plaid.com/docs/transactions/categories/) taxonomy. The `CATEGORY_MAP` in `src/services/budget.ts` maps each Plaid `detailed` category code to one or more dot-notation budget field paths:

| Plaid detailed category | Budget field |
|------------------------|--------------|
| `INCOME_SALARY` | `income.monthlyNet` |
| `RENT_AND_UTILITIES_RENT` | `needs.housing.rentOrMortgage` |
| `RENT_AND_UTILITIES_GAS_AND_ELECTRICITY` | `needs.utilities.utilities` |
| `RENT_AND_UTILITIES_WATER` | `needs.utilities.utilities` |
| `RENT_AND_UTILITIES_INTERNET_AND_CABLE` | `needs.utilities.utilities` |
| `RENT_AND_UTILITIES_TELEPHONE` | `needs.utilities.utilities` |
| `LOAN_PAYMENTS_CAR_PAYMENT` | `needs.transportation.carPayment` |
| `TRANSPORTATION_GAS` | `needs.transportation.gasFuel` |
| `FOOD_AND_DRINK_GROCERIES` | `needs.other.groceries` |
| `PERSONAL_CARE_HAIR_AND_BEAUTY` | `needs.other.personalCare` |
| `FOOD_AND_DRINK_RESTAURANT` | `wants.takeout` |
| `FOOD_AND_DRINK_FAST_FOOD` | `wants.takeout` |
| `GENERAL_MERCHANDISE_ONLINE_MARKETPLACES` | `wants.shopping` |
| `GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES` | `wants.shopping` |
| `GENERAL_MERCHANDISE_SUPERSTORES` | `wants.shopping` |

Multiple Plaid categories can map to the same budget field (e.g., all utility sub-types aggregate into `needs.utilities.utilities`). Transactions with categories not in this map are silently ignored.

**Amount sign convention:**
Plaid represents debits (money leaving the account) as **positive** numbers and credits (money entering) as **negative** numbers. Income categories are special-cased: the amount is negated before accumulating so that a salary deposit (negative in Plaid) becomes a positive `monthlyNet` value. Any transaction that results in an amount ≤ 0 after this conversion is skipped — this handles refunds (negative amounts in expense categories) and anomalous entries.

All accumulated totals are rounded to 2 decimal places: `Math.round(total * 100) / 100`.

---

## Service Functions

### `createEmptyBudget(userId: string): Promise<Budget>`

**File:** `src/services/budget.ts:84`

Creates a new budget item with all numeric fields set to `null` and `status: "PENDING"`. The `budgetId` is generated as `budget#<ULID>` using the `ulid` package for time-ordered, collision-resistant IDs.

Writes the item via `PutCommand` and returns the created budget. Called once per user when they link their first bank account, before transaction analysis begins.

---

### `getBudget(userId: string): Promise<Budget | null>`

**File:** `src/services/budget.ts:92`

Queries the `Budgets` table for the most recent budget belonging to the user. Uses `ScanIndexForward: false` (descending sort by `budgetId`) and `Limit: 1` to efficiently return only the latest record.

Returns `null` if no budget exists for the user.

---

### `analyzeAndPopulateBudget(userId, newItem, transactions): Promise<Budget>`

**File:** `src/services/budget.ts:126`

The core analysis function. Called after every successful Plaid token exchange.

**Steps:**
1. Fetch the user's current budget via `getBudget`. Throws `"No budget found for user"` if none exists.
2. Iterate all transactions, accumulating totals by budget field path using `CATEGORY_MAP`.
3. Apply the rounded totals to the budget object using `setNestedValue` (dot-notation path resolver).
4. Set `budget.status = "PENDING"` and update `updatedAt`.
5. Persist the updated budget via `PutCommand`.
6. Append the new `PlaidItem` to `user.plaidItems` using `list_append(if_not_exists(plaidItems, :emptyList), :newItems)`, which handles the case where `plaidItems` does not yet exist on the user record (first-time link).
7. Set `onboarding.plaidLinked = true` and `onboarding.budgetAnalyzed = true` on the user record.
8. Return the populated budget.

**Total DynamoDB calls:** 3 — one `QueryCommand` (getBudget), one `PutCommand` (budget), one `UpdateCommand` (user).

---

### `updateBudget(userId, budgetId, updates): Promise<Budget>`

**File:** `src/services/budget.ts:183`

Merges partial updates from the user into the existing budget.

**Steps:**
1. Query the budget by `userId` AND `budgetId` (exact key lookup). Throws `"Budget not found"` if not found.
2. Shallow-merge `updates` into the existing budget, then forcibly restore `userId`, `budgetId`, and `createdAt` from the existing record so they cannot be overwritten by the caller.
3. Advance `status`: `"PENDING"` → `"REVIEWED"`. If already `"REVIEWED"` or `"CONFIRMED"`, the status is preserved unchanged.
4. Update `updatedAt` to the current time.
5. Write back via `PutCommand`.

The fetch-merge-put pattern is used instead of dynamic `UpdateExpression` construction to keep the code simple when updating deeply nested fields.

---

### `confirmBudget(userId: string, budgetId: string): Promise<void>`

**File:** `src/services/budget.ts:215`

Locks the budget as final and records completion on the user record.

**Two sequential DynamoDB writes:**
1. `UpdateCommand` on `Budgets` — sets `status = "CONFIRMED"` and `updatedAt`.
2. `UpdateCommand` on `users` — sets `onboarding.budgetConfirmed = true` and `updated_at`.

Returns `void`. Throws if either write fails.

---

## API Routes

All routes are defined in `src/routes/budget.ts` and require a valid Bearer JWT (`verifyToken` pre-handler). The `userId` is always taken from the verified token — users can only access their own budget.

### `GET /budget`

Returns the user's most recent budget.

**Response (200):**
```json
{ "budget": { ...Budget } }
```

**Response (404):** `{ "error": "No budget found" }` — user has not yet linked a bank.

---

### `PUT /budget/:budgetId`

Merges edits into the budget and advances status to `REVIEWED`.

**Path param:** `budgetId` must be URL-encoded (e.g., `budget%2301KHYSJ2PD89YS5YAYFSXG3ST5`).

**Request body:** Any subset of the `Budget` fields to update.

**Response (200):**
```json
{ "budget": { ...updated Budget } }
```

**Response (400):** `{ "error": "Budget not found" }` if the budgetId doesn't match a record owned by the user.

---

### `POST /budget/:budgetId/confirm`

Locks the budget as `CONFIRMED` and completes onboarding.

**Path param:** `budgetId` must be URL-encoded.

**Response (200):**
```json
{ "confirmed": true }
```

---

## Unit Tests

**File:** `src/tests/unit-tests/services/budget.test.ts`

The test suite mocks two modules:

```ts
// Replace DynamoDB client with a mock whose .send() can be configured per-call
vi.mock('../../../lib/db.js', () => ({
  db: { send: vi.fn() },
}));

// Make ulid deterministic so budgetId is predictable in assertions
vi.mock('ulid', () => ({
  ulid: vi.fn(() => 'TESTULIDVALUE'),
}));
```

`mockSend` (i.e., `vi.mocked(db.send)`) is configured with `mockResolvedValueOnce` to return different values for each sequential `db.send` call within a single test. `vi.clearAllMocks()` is called in `beforeEach` to reset state between tests.

A `makeBudget(overrides?)` helper builds a valid `Budget` fixture with all nulls and `status: "PENDING"`, accepting optional field overrides to set up specific scenarios.

---

### `createEmptyBudget` tests (3 tests)

| Test | What it verifies |
|------|-----------------|
| All null fields, PENDING status | Every numeric field is `null`; `status`, `name`, `userId`, `budgetId` are correct |
| Timestamps set to current time | `createdAt` and `updatedAt` are within the test's execution window and are equal |
| Persists via PutCommand | `db.send` is called once with an instance of `PutCommand` |

**What must be true for tests to pass:**
- `emptyBudgetItem` must initialize all numeric fields to `null` and `status` to `"PENDING"`.
- Exactly one `db.send` call must be made, passing a `PutCommand`.
- `budgetId` must be constructed as `"budget#" + ulid()`.

---

### `getBudget` tests (4 tests)

| Test | What it verifies |
|------|-----------------|
| Returns `null` on empty Items | Empty array response → `null` return |
| Returns `null` when Items undefined | Missing Items field → `null` return |
| Returns the budget when found | First item in `Items` is returned as-is |
| Returns only the first item | When multiple Items exist, only the first is returned |
| Uses a QueryCommand | `db.send` is called with a `QueryCommand` instance |

**What must be true for tests to pass:**
- The function must return `result.Items?.[0] ?? null` — both missing and empty `Items` must produce `null`.
- A `QueryCommand` (not a `GetCommand` or `ScanCommand`) must be used.

---

### `analyzeAndPopulateBudget` tests (12 tests)

| Test | What it verifies |
|------|-----------------|
| Throws on missing budget | `getBudget` returning null causes the function to throw `"No budget found for user"` |
| Grocery accumulation | Two grocery transactions sum correctly into `needs.other.groceries` |
| Income sign inversion | `INCOME_SALARY` with a negative Plaid amount (credit) produces a positive `monthlyNet` |
| Restaurant + fast food → takeout | Both Plaid categories add into `wants.takeout` |
| Utility aggregation | Gas/electric, internet, and phone all fold into `needs.utilities.utilities` |
| Water → utilities | `RENT_AND_UTILITIES_WATER` maps to the same utilities field |
| Shopping subcategories | Online, clothing, and superstore all fold into `wants.shopping` |
| Unknown category skipped | Unmapped category codes leave all fields `null` |
| Null category skipped | `personal_finance_category: null` is skipped without error |
| Negative expense skipped | Refunds (negative amount in an expense category) are excluded |
| Positive income skipped | A positive-amount `INCOME_SALARY` (debit from income category) is excluded |
| Rounding to 2dp | `10.005 + 20.006 = 30.01` after `Math.round(total * 100) / 100` |
| Resets status to PENDING | Even if existing budget was `REVIEWED`, status becomes `PENDING` after re-analysis |
| 3 db calls in correct order | `QueryCommand` (getBudget) → `PutCommand` (budget) → `UpdateCommand` (user) |

**What must be true for tests to pass:**
- `getBudget` is called first; if it returns `null`, the function must throw before any writes.
- The amount sign logic must be: `INCOME_CATEGORIES.has(detailed) ? -tx.amount : tx.amount`. Amounts ≤ 0 after this conversion must be skipped.
- Every Plaid detailed code in `CATEGORY_MAP` must map to the correct dot-notation path, and `setNestedValue` must correctly write to the nested field.
- Totals must be rounded: `Math.round(total * 100) / 100`.
- Exactly 3 `db.send` calls must be made in order: `QueryCommand`, `PutCommand`, `UpdateCommand`.
- The `UpdateCommand` for the user must use `list_append(if_not_exists(plaidItems, :emptyList), :newItems)` with `:emptyList: []`.

---

### `updateBudget` tests (8 tests)

| Test | What it verifies |
|------|-----------------|
| Throws on missing budget | `Items: []` from DynamoDB → throws `"Budget not found"` |
| Merges income update | Passing `{ income: { monthlyNet: 5000 } }` sets the field correctly |
| Merges nested needs | All nested `needs` sub-fields can be set in one call |
| PENDING → REVIEWED | Status advances when existing status is `"PENDING"` |
| REVIEWED stays REVIEWED | Status does not change if already `"REVIEWED"` |
| CONFIRMED stays CONFIRMED | Status does not change if already `"CONFIRMED"` |
| Immutable field protection | `userId`, `budgetId`, `createdAt` from `updates` are ignored |
| `updatedAt` refreshed | `updatedAt` is set to the current time, not the old value |
| PutCommand issued | 2 db calls total: `QueryCommand` then `PutCommand` |

**What must be true for tests to pass:**
- The query must use both `userId` and `budgetId` as key conditions (exact item lookup).
- The merge must use `{ ...existing, ...updates, userId: existing.userId, budgetId: existing.budgetId, createdAt: existing.createdAt }` — the explicit overrides after the spread are what protect immutable fields.
- Status logic must be: `existing.status === "PENDING" ? "REVIEWED" : existing.status` — only `"PENDING"` is promoted; `"REVIEWED"` and `"CONFIRMED"` are left unchanged.

---

### `confirmBudget` tests (3 tests)

| Test | What it verifies |
|------|-----------------|
| Issues two UpdateCommands | Two `db.send` calls, both with `UpdateCommand` instances |
| Returns `undefined` | Function returns `void` (no return value) |
| Error propagation | If the first `db.send` rejects, the error bubbles up |

**What must be true for tests to pass:**
- Two separate `UpdateCommand` writes must occur: one targeting `Budgets` (by `{ userId, budgetId }`) and one targeting `users` (by `{ id: userId }`).
- No value must be returned from the function.
- No swallowed errors — if DynamoDB rejects, the exception propagates to the caller.
