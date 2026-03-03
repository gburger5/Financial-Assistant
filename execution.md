# Execution Plan: Agent Route Tests

Step-by-step guide to create and verify unit tests for [agent.ts](file:///Users/gb/Desktop/Financial-Assistant/server/src/routes/agent.ts).

---

## Step 1 — Create the Test File

Create `server/src/tests/unit-tests/routes/agent.test.ts`.

---

## Step 2 — Add Mocks (top of file, before any imports from source)

Mock **all 8** external dependencies using `vi.mock()`. These must appear before importing the modules they replace.

```typescript
import { vi, describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

// 1. DynamoDB client
vi.mock('../../../lib/db.js', () => ({
  db: { send: vi.fn() },
}));

// 2. Budget service
vi.mock('../../../services/budget.js', () => ({
  getBudget: vi.fn(),
}));

// 3. Auth service
vi.mock('../../../services/auth.js', () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  getUserById: vi.fn(),
}));

// 4. Encryption
vi.mock('../../../lib/encryption.js', () => ({
  decryptToken: vi.fn(() => 'decrypted-access-token'),
}));

// 5. Plaid client
vi.mock('../../../lib/plaid.js', () => ({
  plaidClient: {
    liabilitiesGet: vi.fn(),
    investmentsHoldingsGet: vi.fn(),
  },
}));

// 6. ULID
vi.mock('ulid', () => ({
  ulid: vi.fn(() => 'MOCK_ULID'),
}));

// 7. Auth middleware — bypass JWT, stamp req.user
vi.mock('../../../middleware/auth.js', () => ({
  verifyToken: vi.fn(async (req: any) => {
    req.user = {
      userId: 'user-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      jti: 'token-id',
    };
  }),
}));

// 8. Global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
```

---

## Step 3 — Import Source Modules (after mocks)

```typescript
import { buildApp } from '../../../app.js';
import { db } from '../../../lib/db.js';
import { getBudget } from '../../../services/budget.js';
import { getUserById } from '../../../services/auth.js';
import { plaidClient } from '../../../lib/plaid.js';
import type { FastifyInstance } from 'fastify';

const mockSend = vi.mocked(db.send);
const mockGetBudget = vi.mocked(getBudget);
const mockGetUserById = vi.mocked(getUserById);
const mockPlaidLiabilities = vi.mocked(plaidClient.liabilitiesGet);
const mockPlaidInvestments = vi.mocked(plaidClient.investmentsHoldingsGet);
```

---

## Step 4 — Define Test Fixtures

Create helper constants and factory functions to share across tests.

```typescript
const USER_ID = 'user-123';

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    proposalId: 'prop-1',
    userId: USER_ID,
    type: 'budget',
    status: 'pending',
    summary: 'Test proposal',
    rationale: 'Because tests',
    payload: { debtAllocation: '200', investingAllocation: '300' },
    budget: { /* minimal budget shape */ },
    totalAllocation: '500',
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBudget() {
  return {
    userId: USER_ID,
    budgetId: 'budget#MOCK_ULID',
    status: 'PENDING',
    income: { monthlyNet: 5000 },
    needs: { housing: { rentOrMortgage: 1500 }, utilities: { utilities: 200 },
             transportation: { carPayment: 300, gasFuel: 100 },
             other: { groceries: 400, personalCare: 50 } },
    wants: { takeout: 100, shopping: 150 },
    investments: { monthlyContribution: 300 },
    debts: { minimumPayments: 200 },
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    name: 'Monthly Budget',
  };
}

function mockFetchOk(body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => body,
  } as Response);
}

function mockFetchError(status: number, text: string) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => text,
  } as Response);
}
```

---

## Step 5 — App Lifecycle & Reset

```typescript
let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: user has a Plaid item
  mockGetUserById.mockResolvedValue({
    id: USER_ID,
    plaidItems: [{ accessToken: 'enc-token', linkedAt: '2025-01-01T00:00:00.000Z' }],
    dateOfBirth: '1990-05-15',
  } as any);
});
```

---

## Step 6 — Write Tests for `POST /agent/budget`

Test these scenarios:
1. **Happy path**: `mockGetBudget` returns a budget → `mockFetch` returns a proposal → assert 200 + proposal returned.
2. **No budget (404)**: `mockGetBudget` returns `null` → assert 404 + error message.
3. **Agent unreachable (502)**: `mockGetBudget` returns budget → `mockFetch` throws → assert 502.
4. **Agent error (502)**: `mockGetBudget` returns budget → `mockFetch` returns `{ ok: false }` → assert 502.

Each test uses `app.inject({ method: 'POST', url: '/agent/budget' })`.

---

## Step 7 — Write Tests for `POST /agent/budget/:proposalId/respond`

### Approve flow (approved: true)
1. **Success**: Mock `db.send` to return a proposal on `GetCommand`, then expect 3 more `db.send` calls (UpdateCommand for proposal status, PutCommand for budget, UpdateCommand for user onboarding) + `fetch` called twice (debt + investing agents). Assert `{ success: true }`.
2. **404**: Mock `db.send` to return `{ Item: undefined }` → assert 404.

### Reject flow (approved: false)
3. **Success**: Mock `db.send` to return proposal → `mockGetBudget` for re-fetch → `mockFetch` for revision → assert new proposal returned.
4. **502 agent unreachable**: `mockFetch` throws.
5. **502 agent error**: `mockFetch` returns `{ ok: false }`.

Each test uses:
```typescript
app.inject({
  method: 'POST',
  url: '/agent/budget/prop-1/respond',
  payload: { approved: true /* or false, rejectionReason: '...' */ },
});
```

> [!IMPORTANT]
> For the **approve** path, `triggerDebtAgent` and `triggerInvestingAgent` are fire-and-forget (`.catch()`), so they won't affect the response. You only need to verify `fetch` was called; you don't need to assert on their results.

---

## Step 8 — Write Tests for `POST /agent/debt/:proposalId/respond`

### Approve flow
1. Mock `db.send` → GetCommand returns proposal → expect UpdateCommand with `pendingTransactions` and `txnStatus: "queued"` → assert `{ success: true }`.
2. 404 when proposal not found.

### Reject flow
3. Mock `db.send` → GetCommand returns proposal, then UpdateCommand for rejection → mock Plaid `liabilitiesGet` → mock `fetch` for debt agent → assert new proposal.
4. 502 when debt agent throws.

> [!TIP]
> For the reject path, `triggerDebtAgent` calls `plaidClient.liabilitiesGet`. You need to mock this to return Plaid liabilities data (or throw `PRODUCTS_NOT_SUPPORTED` to skip gracefully).

---

## Step 9 — Write Tests for `POST /agent/investing/:proposalId/respond`

Same structure as debt, but:
- Uses `plaidClient.investmentsHoldingsGet` instead of `liabilitiesGet`
- Uses `triggerInvestingAgent` which also reads `getUserById` for `dateOfBirth`

### Approve flow
1. Happy path → assert `{ success: true }`.
2. 404 when not found.

### Reject flow
3. Happy path → mock holdings + fetch → assert new proposal.
4. 502 when investing agent throws.

---

## Step 10 — Write Tests for `GET /proposals`

1. **All proposals**: Mock `db.send` ScanCommand returning 3 items → assert sorted by `createdAt` desc.
2. **Filter by type**: Send `?type=budget` → verify ScanCommand's `FilterExpression` includes `#t = :type`.
3. **Filter by status**: Send `?status=pending` → verify filter expression.
4. **Empty results**: Mock `db.send` returning `{ Items: [] }` → assert `{ proposals: [] }`.

```typescript
app.inject({
  method: 'GET',
  url: '/proposals?type=budget&status=pending',
});
```

> [!TIP]
> To verify the DynamoDB filter expressions, inspect `mockSend.mock.calls[0][0].input` — the ScanCommand input will have `FilterExpression`, `ExpressionAttributeValues`, and optionally `ExpressionAttributeNames`.

---

## Step 11 — Run & Verify

```bash
# Run just the new tests
cd server
npx vitest run src/tests/unit-tests/routes/agent.test.ts

# Verify ALL existing tests still pass
npx vitest run

# Optional: check coverage
npx vitest run --coverage src/tests/unit-tests/routes/agent.test.ts
```

**Expected outcome**: All ~22 tests pass, no regressions in existing tests.

---

## Quick Reference: `db.send` Mock Chaining

For routes that make multiple DynamoDB calls, chain `.mockResolvedValueOnce()`:

```typescript
mockSend
  .mockResolvedValueOnce({ Item: makeProposal() })   // GetCommand
  .mockResolvedValueOnce({})                          // UpdateCommand
  .mockResolvedValueOnce({})                          // PutCommand
  .mockResolvedValueOnce({});                         // UpdateCommand
```

The order must match the order of `db.send()` calls in the route handler.
