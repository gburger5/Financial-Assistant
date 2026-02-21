# Onboarding Flow

This document describes the user onboarding journey from account creation through budget confirmation, covering both the backend state machine and the reference frontend example.

---

## Overview

Onboarding moves a new user through four sequential steps:

| Step | Name | What happens |
|------|------|--------------|
| 0 | Auth | Register or log in |
| 1 | Connect bank | One or more Plaid Link sessions |
| 2 | Review budget | Inspect and edit AI-estimated values |
| 3 | Confirm budget | Lock the budget as final |
| 4 | Done | Onboarding complete |

Progress is tracked in two places:

- **`budget.status`** on the `Budgets` table — `"PENDING"` → `"REVIEWED"` → `"CONFIRMED"`
- **`onboarding.*` flags** on the `users` table — `plaidLinked`, `budgetAnalyzed`, `budgetConfirmed`

---

## Backend Flow

### Step 0 — Auth

The user registers (`POST /register`) or logs in (`POST /login`). On successful registration, a new UUID is assigned as the `userId`. Login returns a signed JWT (7-day expiry) that must be included as a `Bearer` token on all subsequent requests.

At registration time a budget is **not** created yet — that happens during the Plaid exchange.

See `src/services/auth.ts` for validation rules (password complexity, lockout logic) and `src/middleware/auth.ts` for JWT verification.

### Step 1 — Connect bank(s)

**1a. Create a link token**

```
POST /plaid/create-link-token
Authorization: Bearer <jwt>
```

The server calls Plaid's `linkTokenCreate` API, passing the authenticated `userId` as `client_user_id`. Plaid returns a short-lived `link_token` that the frontend uses to initialize Plaid Link.

**1b. Exchange the public token**

After the user completes Plaid Link, the frontend receives a `public_token`. It sends this to:

```
POST /plaid/exchange-token
Authorization: Bearer <jwt>
{ "public_token": "public-sandbox-..." }
```

The server:
1. Exchanges the public token for a permanent `accessToken` and `itemId` via Plaid.
2. Looks up any previously linked banks from `user.plaidItems`.
3. Syncs settled transactions from **every** linked bank (including the new one) for the last 30 days.
4. Calls `analyzeAndPopulateBudget`, which:
   - Creates an empty budget if none exists yet, or overwrites the fields of the existing one.
   - Maps each transaction's Plaid `personal_finance_category.detailed` code to a budget field.
   - Appends the new `{ accessToken, itemId, linkedAt }` item to `user.plaidItems`.
   - Sets `onboarding.plaidLinked = true` and `onboarding.budgetAnalyzed = true` on the user record.
5. Returns `{ budget, banksConnected }`.

The user can repeat this step to link additional banks. Each new bank's transactions are added to the total before re-analyzing, so all linked banks contribute to a single consolidated budget estimate.

### Step 2 — Review budget

The frontend loads the current budget:

```
GET /budget
Authorization: Bearer <jwt>
```

The user reviews the auto-populated values and can edit any field. On save:

```
PUT /budget/:budgetId
Authorization: Bearer <jwt>
{ ...updated Budget fields... }
```

The server fetches the existing budget, shallow-merges the updates in (protecting `userId`, `budgetId`, and `createdAt` from being overwritten), and advances `status` from `"PENDING"` to `"REVIEWED"`. The merged budget is written back via `PutCommand`.

The `:budgetId` path parameter **must be URL-encoded** because the ID format `budget#<ULID>` contains a `#` character, which browsers interpret as a URL fragment. Use `encodeURIComponent(budget.budgetId)` in any frontend code.

### Step 3 — Confirm budget

```
POST /budget/:budgetId/confirm
Authorization: Bearer <jwt>
```

Two DynamoDB writes happen atomically in sequence:
1. `status` is set to `"CONFIRMED"` and `updatedAt` is updated on the budget record.
2. `onboarding.budgetConfirmed = true` is set on the user record.

### Step 4 — Done

Onboarding is complete. The `budget.status === "CONFIRMED"` flag is the canonical signal that onboarding has finished.

---

## Resuming Onboarding

If a user returns mid-flow (e.g., closes the browser), the session can be resumed. On login or page load, the frontend fetches `GET /budget` and checks `budget.status`:

| `status` | `isBudgetPopulated` | Where to resume |
|----------|---------------------|-----------------|
| `"CONFIRMED"` | — | Step 4 (Done) |
| `"REVIEWED"` | — | Step 2 (Review) |
| `"PENDING"` | `true` | Step 2 (Review) — at least one bank was already linked |
| `"PENDING"` | `false` | Step 1 (Connect bank) |
| No budget | — | Step 1 (Connect bank) |

`isBudgetPopulated` is a frontend check that returns `true` if any of `income.monthlyNet`, `needs.housing.rentOrMortgage`, or `wants.takeout` are non-null, meaning a bank has already been linked and transactions analyzed.

---

## Onboarding Example

`src/onboarding-example/` is a self-contained single-page HTML/JS app that demonstrates the complete flow against the running local server. It is **for development reference only** and is not part of the production application.

### Running it

1. Start the backend: `npm run dev` (from `server/`)
2. Set `FRONTEND_URL=http://localhost:5500` in `server/.env` (or whatever port your server uses).
3. Open `src/onboarding-example/index.html` with VS Code Live Server on port 5500, or any static file server pointed at that origin.

### Structure

```
src/onboarding-example/
├── index.html   # Markup, styles, and step layout
└── app.js       # All client-side logic
```

**`index.html`** defines five sections (`#step-auth`, `#step-plaid`, `#step-budget`, `#step-confirm`, `#step-done`). Only one is visible at a time via the `.visible` CSS class toggled by `goToStep(n)`.

**`app.js`** is structured into distinct sections:

| Section | Key functions | Purpose |
|---------|---------------|---------|
| State | `token`, `currentBudget`, `banksConnected` | In-memory state, `token` persisted to `localStorage` |
| Bootstrap | `init()` (IIFE) | Resumes session on page load |
| Navigation | `goToStep(n)` | Shows the correct section and updates step dots |
| Auth | `doLogin()`, `doRegister()`, `doLogout()` | Calls `/login`, `/register` |
| Plaid Link | `openPlaidLink()` | Calls `/plaid/create-link-token`, opens Plaid Link, handles `onSuccess` |
| Budget form | `renderBudgetForm(budget)`, `saveBudget()` | Renders editable inputs from budget data, PUTs changes |
| Confirm | `renderBudgetSummary(budget)`, `doConfirm()` | Shows read-only summary, POSTs confirm |
| Helpers | `apiFetch()`, `fetchBudget()` | Fetch wrapper with auth header; budget GET helper |

### Sandbox credentials

When Plaid Link opens in sandbox mode, use:
- **Username:** `user_good`
- **Password:** `pass_good`

These are Plaid's standard sandbox test credentials and will simulate a successful bank connection with pre-populated transaction history.

### Important implementation note

The `budgetId` field uses the format `budget#<ULID>`. Because `#` is the URL fragment separator, it must be percent-encoded in all URL path segments:

```js
// Correct
apiFetch(`/budget/${encodeURIComponent(currentBudget.budgetId)}`, { method: 'PUT', ... });
apiFetch(`/budget/${encodeURIComponent(currentBudget.budgetId)}/confirm`, { method: 'POST' });

// Incorrect — browser strips everything after '#'
apiFetch(`/budget/${currentBudget.budgetId}`, ...);
```
