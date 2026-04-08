# Agents Module

Comprehensive reference for the LLM-powered agent system under [server/src/modules/agents/](../src/modules/agents/). If you're new to this module, read sections 1–3 first, then jump to whichever subsystem you need.

---

## 1. Overview

The agents module provides three LLM-powered financial advisors:

| Agent      | Purpose                                                              |
| ---------- | -------------------------------------------------------------------- |
| Budget     | Analyzes Plaid-synced spending and recommends an improved budget     |
| Debt       | Builds a monthly debt repayment plan from liabilities and allocation |
| Investing  | Allocates a monthly investing budget across retirement / taxable     |

### Proposal-first design

Agents never mutate user financial data directly. Every run produces a **Proposal** — a persisted structured output the user must explicitly **approve**, **reject**, or **execute**. Only `execute` creates real financial records (transactions, balance adjustments, budget updates). This boundary is enforced in [agents.service.ts](../src/modules/agents/agents.service.ts).

### Tech stack

- `@strands-agents/sdk` agent runtime with `AnthropicModel`
- Model: `claude-sonnet-4-6`, `maxTokens: 4096`
- **Zod** schemas for structured output — validated automatically by the SDK
- **DynamoDB** for proposal and metrics persistence
- **pino** logger with OTel-style correlation fields

### Request flow

```
HTTP request
   │
   ▼
agents.route.ts  ── verifyJWT preHandler
   │
   ▼
agents.controller.ts  ── thin HTTP adapter
   │
   ▼
agents.service.ts  ── duplicate guard → fetch data → invoke → save proposal
   │                                        │
   │                                        ▼
   │                            core/{budget,debt,investing}-agent.ts
   │                                        │
   │                                        ▼
   │                                  Strands Agent
   │                                        │
   │                              ┌─────────┴─────────┐
   │                              ▼                   ▼
   │                     Anthropic API         core/tools.ts
   │                                                  │
   │                                                  ▼
   │                                  accounts / liabilities / holdings / auth
   ▼
agents.repository.ts ── Proposals + AgentMetrics tables
```

---

## 2. Directory Layout

| Path                                                                                  | Purpose                                         |
| ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [agents.route.ts](../src/modules/agents/agents.route.ts)                               | Fastify route plugin, JSON Schemas, JWT guards  |
| [agents.controller.ts](../src/modules/agents/agents.controller.ts)                    | HTTP handlers — delegate to service             |
| [agents.service.ts](../src/modules/agents/agents.service.ts)                          | Orchestration, proposal lifecycle, execution    |
| [agents.repository.ts](../src/modules/agents/agents.repository.ts)                    | DynamoDB persistence for proposals & metrics    |
| [agents.types.ts](../src/modules/agents/agents.types.ts)                              | Shared type definitions                         |
| [core/budget-agent.ts](../src/modules/agents/core/budget-agent.ts)                    | `invokeBudgetAgent` + agent factory             |
| [core/debt-agent.ts](../src/modules/agents/core/debt-agent.ts)                        | `invokeDebtAgent` + agent factory               |
| [core/investing-agent.ts](../src/modules/agents/core/investing-agent.ts)              | `invokeInvestingAgent` + agent factory          |
| [core/tools.ts](../src/modules/agents/core/tools.ts)                                  | Zod output schemas + read-only tool definitions |
| [core/prompts.ts](../src/modules/agents/core/prompts.ts)                              | System prompts for each agent                   |
| [lib/agent-logger.ts](../src/lib/agent-logger.ts)                                     | pino singleton + Strands SDK log wiring         |
| [agents-unit-tests/](../src/modules/agents/agents-unit-tests/)                        | Unit tests for controller/service/repo/tools    |
| [evals/](../src/evals/)                                                               | Eval harness (cases, scorers, runners)          |

---

## 3. HTTP API

All routes are registered with prefix `/api/agent`. Authentication is `verifyJWT` on every endpoint — the user id is read from the JWT and is **never** accepted from the request body.

| Method | Path                              | Body                              | Success | Description                                          |
| ------ | --------------------------------- | --------------------------------- | ------- | ---------------------------------------------------- |
| POST   | `/budget`                         | —                                 | 201     | Run budget agent, return pending proposal            |
| POST   | `/debt`                           | `{ debtAllocation: number }`      | 201     | Run debt agent for the given monthly debt budget     |
| POST   | `/investing`                      | `{ investingAllocation: number }` | 201     | Run investing agent for the given monthly allocation |
| GET    | `/proposals?agentType=...`        | —                                 | 200     | Proposal history, optional type filter               |
| GET    | `/proposals/:proposalId`          | —                                 | 200     | Single proposal                                      |
| POST   | `/proposals/:proposalId/approve`  | —                                 | 200     | Transition `pending → approved`                      |
| POST   | `/proposals/:proposalId/reject`   | —                                 | 200     | Transition `pending → rejected`                      |
| POST   | `/proposals/:proposalId/execute`  | —                                 | 200     | Apply side effects, transition `approved → executed` |

### Request body schemas

Both `/debt` and `/investing` use `additionalProperties: false` and require the numeric allocation with `minimum: 0`. See [agents.route.ts](../src/modules/agents/agents.route.ts).

### Response body (all routes)

```jsonc
{
  "userId": "…",
  "proposalId": "01HX…",              // ULID
  "agentType": "budget" | "debt" | "investing",
  "status": "pending" | "approved" | "rejected" | "executed",
  "result": { /* structured output — shape depends on agentType */ },
  "createdAt": "2026-04-08T…",
  "updatedAt": "2026-04-08T…"
}
```

### Error statuses

- `401` — missing/invalid JWT
- `404` — proposal not found, or no budget (for `POST /budget`)
- `409` — duplicate pending proposal for the same `(userId, agentType)`
- `400` — invalid state transition (e.g. approving a non-pending proposal)
- `503` — agent invocation failed (timeout, model error) — masked from client

---

## 4. The Three Agents

All three agents share the same skeleton: a `make<Name>Agent()` factory that constructs a fresh `Agent` with a system prompt, the five tools from `core/tools.ts`, and a Zod `structuredOutputSchema` — plus an `invoke<Name>Agent(…)` function that calls `agent.invoke(message)` and returns `{ output, metrics }`.

A **fresh agent is built per request** so no conversation state leaks between users.

### 4.1 Budget Agent

- **File:** [core/budget-agent.ts](../src/modules/agents/core/budget-agent.ts)
- **Entry point:** `invokeBudgetAgent(userId, budget)`
- **Input:** the user's current [Budget](../src/modules/budget/budget.types.ts) (auto-derived from Plaid spending) serialized into the prompt
- **Output:** `BudgetProposal` — see `budgetProposalSchema` in [core/tools.ts](../src/modules/agents/core/tools.ts). Fields align 1:1 with the internal `Budget` type (income + 12 category amounts + `summary`/`rationale`)
- **System prompt:** [core/prompts.ts](../src/modules/agents/core/prompts.ts) `BUDGET_SYSTEM_PROMPT` — anchors on the **50/30/20** framing (needs / wants / savings) and requires a human-readable `summary` and `rationale`
- **Tools:** all five (see §5)
- **Constraints:** returned numbers must be monthly dollar amounts; all budget categories are exhaustive

### 4.2 Debt Agent

- **File:** [core/debt-agent.ts](../src/modules/agents/core/debt-agent.ts)
- **Entry point:** `invokeDebtAgent({ userId, debtAllocation, debts })`
- **Input:** `DebtAgentInput` — `debts` is mapped from liabilities + accounts by `mapLiabilitiesToDebtAccounts` in [agents.service.ts](../src/modules/agents/agents.service.ts)
- **Output:** `DebtPaymentPlan` — `summary`, `rationale`, `scheduled_payments[]`, `projections[]`, `interest_savings`, `positive_outcomes`
- **System prompt:** `DEBT_SYSTEM_PROMPT` — prefers the **avalanche** method (highest APR first) with a snowball fallback when motivation matters
- **Tools:** all five
- **Constraints:** sum of `scheduled_payments[].amount` must equal `debtAllocation` **exactly**; every debt account either receives a payment or is justified as skipped

### 4.3 Investing Agent

- **File:** [core/investing-agent.ts](../src/modules/agents/core/investing-agent.ts)
- **Entry point:** `invokeInvestingAgent({ userId, investingAllocation, accounts, userAge })`
- **Input:** `InvestingAgentInput` — accounts mapped from accounts + holdings by `mapToInvestmentAccounts`
- **Output:** `InvestmentPlan` — `summary`, `rationale`, `scheduled_contributions[]`, `projections` (incl. per-holding retirement projections), `positive_outcome`
- **System prompt:** `INVESTING_SYSTEM_PROMPT` — priority order **401k match → IRA → 401k (beyond match) → taxable brokerage**, with a **three-fund portfolio** (US total / international / bonds) as the default target allocation
- **Tools:** all five
- **Constraints:** sum of `scheduled_contributions[].amount` must equal `investingAllocation` exactly; projections assume retirement age 60 and 7% annual return

---

## 5. Tools

All tools are **read-only**. Failures are returned as structured `{ error, message, retryable }` objects rather than thrown, so the agent can reason about and retry. Source: [core/tools.ts](../src/modules/agents/core/tools.ts).

| Tool                            | Input      | Wraps service                                  | Used by          |
| ------------------------------- | ---------- | ---------------------------------------------- | ---------------- |
| `get_user_accounts`             | `{userId}` | `accounts.service.getAccountsForUser`          | all              |
| `get_user_holdings`             | `{userId}` | `investments.service.getLatestHoldings`        | all              |
| `get_user_liabilities`          | `{userId}` | `liabilities.service.getLiabilitiesForUser`    | all              |
| `get_user_profile`              | `{userId}` | `auth.service.getUserById` (+ age calc)        | all              |
| `get_user_financial_snapshot`   | `{userId}` | `Promise.allSettled` of the three fetch tools  | all (preferred)  |

**Error shape:**

```ts
{ error: 'FAILED_TO_FETCH_ACCOUNTS', message: '…', retryable: true }
```

`get_user_profile` returns `{ error: 'USER_NOT_FOUND', retryable: false }` when the user does not exist — agents should not retry.

`get_user_financial_snapshot` uses `Promise.allSettled` so a failure in one dataset does not block the other two. Each dataset has independent `data` / `error` / `isEmpty` fields in the response.

---

## 6. Proposal Lifecycle

### State machine

```
          run<X>Agent        approveProposal        executeProposal
   ─────▶  pending  ────────▶  approved  ────────▶  executed
              │
              │  rejectProposal
              ▼
           rejected
```

### Duplicate guard

`runBudgetAgent`, `runDebtAgent`, `runInvestingAgent` all call `agentsRepository.getPendingProposal(userId, agentType)` before invoking the LLM. If a pending proposal already exists, they throw `ConflictError` (HTTP 409). This prevents wasting tokens on spam clicks and guarantees at most one pending proposal per `(userId, agentType)`.

### Atomic transitions

`agentsRepository.updateProposalStatus(userId, proposalId, newStatus, expectedCurrentStatus)` issues a DynamoDB `UpdateCommand` with `ConditionExpression: '#status = :expectedStatus'`. Invalid transitions (e.g. approving an already-executed proposal) fail at the DB layer with `ConditionalCheckFailedException`.

### Persistence — Proposals table

- **Table:** `Proposals`
- **PK:** `userId`
- **SK:** `proposalId` (ULID — lexicographic order = chronological order)
- **Shape:** see [Proposal](../src/modules/agents/agents.types.ts)

### Execution semantics

`executeProposal(userId, proposalId)` in [agents.service.ts](../src/modules/agents/agents.service.ts) dispatches on `agentType`:

- **Budget** — calls `updateBudget(userId, …)` in [budget.service.ts](../src/modules/budget/budget.service.ts) with the 13 category amounts from the proposal. On success, `setAgentBudgetApproved(userId)` is called on the user record so the onboarding flow skips the agent step on subsequent logins.
- **Debt** — for each `scheduled_payments[i]`:
  1. `createManualTransaction` with `transactionId = proposal_${proposalId}_${i}` (categorized `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`)
  2. `adjustBalance` on the debt account (`-amount`)
  3. `adjustBalance` on the primary checking account (`-amount`)
- **Investing** — for each `scheduled_contributions[i]`:
  1. `createManualInvestmentTransaction` with deterministic ID; `securityId` is `fund_ticker` or `cash_<plaidAccountId>`
  2. `addToHolding` with the computed quantity
  3. `adjustBalance` on the investment account (`+amount`)
  4. `adjustBalance` on primary checking (`-amount`)

The primary checking account is resolved via `findCheckingAccount` (first account matching `type === 'depository' && subtype === 'checking'`). Savings/emergency accounts are never used as the source of truth.

### Idempotency

Deterministic transaction IDs (`proposal_${proposalId}_${index}`) make retries safe — re-executing after a partial failure is a no-op for already-written records. The `approved → executed` transition runs **after** all side effects, so a crashed execution leaves the proposal in `approved` state and can be safely retried.

---

## 7. Orchestration Service

Each `runXAgent` in [agents.service.ts](../src/modules/agents/agents.service.ts) follows the same six-step pattern:

1. **Generate invocation id** — ULID bound to a pino child logger with `agent.type`, `agent.invocation_id`, `user.id`
2. **Duplicate guard** — `getPendingProposal` → throw `ConflictError` if one exists
3. **Fetch inputs** — budget / liabilities / accounts / holdings / user age (parallelized with `Promise.all` where independent)
4. **Invoke core agent** — try/catch around `invokeXAgent(...)`, mapping any failure to `ServiceUnavailableError` with a user-friendly message
5. **Save proposal** — `buildProposal` (new ULID + timestamps) → `saveProposal`
6. **Fire-and-forget metrics** — `saveAgentMetrics(buildMetricsRecord(...))` with `.catch(logMetricsSaveFailure(log))` so metrics failures never block proposal creation

---

## 8. LLM Configuration

| Setting              | Value                                                     |
| -------------------- | --------------------------------------------------------- |
| SDK                  | `@strands-agents/sdk` with `AnthropicModel`               |
| Model                | `claude-sonnet-4-6`                                       |
| `maxTokens`          | `4096`                                                    |
| Structured output    | Zod schemas in [core/tools.ts](../src/modules/agents/core/tools.ts) |
| Agent lifetime       | Fresh per request — no shared state between invocations  |
| Env var              | `ANTHROPIC_API_KEY` (required)                            |

The SDK's structured-output mode validates the response against the provided Zod schema before returning; schema violations raise at `agent.invoke` time and are caught by the service as `ServiceUnavailableError`.

---

## 9. Logging

- **Singleton:** [lib/agent-logger.ts](../src/lib/agent-logger.ts) — `getAgentLogger()` returns a module-cached pino root logger. On first call it also calls the SDK's `configureLogging` with a child bound to `{ component: 'strands-sdk' }`, routing SDK-internal output through the same pipeline.
- **Per-run child loggers:** `createInvocationLogger(agentType, userId, invocationId)` binds OTel-style fields:
  - `agent.type`
  - `agent.invocation_id` (ULID — same id as the persisted metrics record)
  - `user.id`
- **Log points:**

  | Level  | Event                                           | Notable fields                                                                      |
  | ------ | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
  | debug  | agent invocation starting                       | input counts (no financial values)                                                  |
  | info   | agent invocation succeeded                      | `agent.proposal_id`, `agent.total_tokens`, `agent.duration_ms`, `agent.cycle_count`, `tool.error_count` |
  | error  | agent invocation failed                         | `error.type`, `error.message`                                                       |
  | warn   | agent metrics persistence failed                | `error.type`, `error.message`                                                       |
  | info   | proposal status transition / proposal executed  | `agent.proposal_id`, `proposal.status_from`, `proposal.status_to`                   |

  Financial values (balances, amounts) are **never** logged — only counts, durations, and ids.

---

## 10. Metrics

- **Table:** `AgentMetrics`
- **PK:** `userId`
- **SK:** `metricId` (ULID)
- **GSI:** `agentType` (HASH) + `createdAt` (RANGE) — for cross-user trend queries
- **Write path:** fire-and-forget from `runXAgent` (`.catch(logMetricsSaveFailure)`) so a broken metrics table never blocks a proposal save
- **Correlation:** `invocationId` on the record matches `agent.invocation_id` in log lines — operators can pivot from a log entry to the metric record and vice versa

### Record shape

See `AgentMetricsRecord` in [agents.types.ts](../src/modules/agents/agents.types.ts). Key fields:

| Field                                          | Meaning                                               |
| ---------------------------------------------- | ----------------------------------------------------- |
| `totalTokens` / `inputTokens` / `outputTokens` | Usage for cost monitoring                             |
| `cacheReadTokens` / `cacheWriteTokens`         | Prompt cache hits/writes                              |
| `totalDurationMs` / `modelLatencyMs`           | Wall-clock vs. model-only timing                      |
| `cycleCount` / `averageCycleDurationMs`        | Reasoning cycles — high counts flag prompt issues     |
| `toolMetrics`                                  | Per-tool `StoredToolMetrics` — callCount, successCount, errorCount, totalTimeMs, averageTimeMs, successRate |

---

## 11. Evaluation Harness

- **Location:** [server/src/evals/](../src/evals/)
- **Vitest config:** [server/vitest.eval.config.ts](../vitest.eval.config.ts)
- **Run commands:**

  ```bash
  npm run eval           # all agents
  npm run eval:budget
  npm run eval:debt
  npm run eval:investing
  ```

### Structure

| Path                                              | Purpose                                             |
| ------------------------------------------------- | --------------------------------------------------- |
| [eval.types.ts](../src/evals/eval.types.ts)       | Case / score / result types                         |
| [eval.config.ts](../src/evals/eval.config.ts)     | Global config (concurrency, thresholds)             |
| [cases/*.cases.ts](../src/evals/cases/)           | Test case fixtures per agent                        |
| [scoring/*.scorer.ts](../src/evals/scoring/)      | Scoring functions per agent                         |
| [runners/*.eval.ts](../src/evals/runners/)        | Vitest entry points per agent                       |
| [fixtures/](../src/evals/fixtures/)               | Shared fixture data                                 |
| [results/](../src/evals/results/)                 | Persisted run output                                |

### Scoring model

- **Hard constraints** — binary pass/fail (e.g. sums match exact allocation, required fields present). A single failed hard constraint fails the case.
- **Soft scores** — weighted `[0, 1]` floats (e.g. rationale quality, alignment with strategy). Aggregated to an overall score.

See `scoring/shared.ts` for the shared scoring utilities.

---

## 12. Types Reference

All in [agents.types.ts](../src/modules/agents/agents.types.ts).

| Type                    | Purpose                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `AgentType`             | `'budget' \| 'debt' \| 'investing'`                              |
| `ProposalStatus`        | `'pending' \| 'approved' \| 'rejected' \| 'executed'`            |
| `Proposal`              | Persisted proposal record (DynamoDB `Proposals`)                 |
| `AgentInvokeResult<T>`  | `{ output: T, metrics: AgentMetrics \| undefined }`              |
| `DebtAccount`           | Agent-facing debt account shape                                  |
| `DebtAgentInput`        | `{ userId, debtAllocation, debts }`                              |
| `InvestmentHolding`     | Agent-facing holding                                             |
| `InvestmentAccount`     | Agent-facing investment account with nested holdings             |
| `InvestingAgentInput`   | `{ userId, investingAllocation, accounts, userAge }`             |
| `ScheduledPayment`      | One row of a debt payment plan                                   |
| `ScheduledContribution` | One row of an investment plan                                    |
| `AgentMetricsRecord`    | Persisted metrics record (DynamoDB `AgentMetrics`)               |
| `StoredToolMetrics`     | Per-tool stats embedded in `AgentMetricsRecord.toolMetrics`      |
| `RunDebtAgentBody`      | `POST /debt` body shape                                          |
| `RunInvestingAgentBody` | `POST /investing` body shape                                     |

The three structured-output types — `BudgetProposal`, `DebtPaymentPlan`, `InvestmentPlan` — live in [core/tools.ts](../src/modules/agents/core/tools.ts) alongside their Zod schemas.

---

## 13. Service Dependencies

Agents follow the rule "services call services, not other modules' repositories" — any caching added to a downstream module is automatically inherited.

| Module         | Used by agents for                                                               |
| -------------- | -------------------------------------------------------------------------------- |
| `budget`       | `getLatestBudget` (fetch input to budget agent); `updateBudget` (execute)        |
| `liabilities`  | `getLiabilitiesForUser` (debt agent input; `get_user_liabilities` tool)          |
| `accounts`     | `getAccountsForUser` (all agents & tool); `adjustBalance` (debt/investing execute) |
| `investments`  | `getLatestHoldings` (investing input & tool); `createManualInvestmentTransaction`, `addToHolding` (execute) |
| `transactions` | `createManualTransaction` (debt execute)                                         |
| `auth`         | `getUserById` (profile tool, age calc); `setAgentBudgetApproved` (budget execute) |

---

## 14. Configuration

- **`ANTHROPIC_API_KEY`** — required. Used by `AnthropicModel` inside each agent factory. Missing key causes agent invocation to throw, which the service maps to `ServiceUnavailableError` (HTTP 503).
- All other server configuration (DynamoDB region, JWT secrets, etc.) is inherited from the root server config — nothing agent-specific.

---

## 15. Testing

### Unit tests

[agents-unit-tests/](../src/modules/agents/agents-unit-tests/):

- `agents.route.test.ts` — route wiring, JWT enforcement, schema validation
- `agents.controller.test.ts` — HTTP status mapping
- `agents.service.test.ts` — orchestration, duplicate guard, execution dispatch, mapping helpers
- `agents.repository.test.ts` — DynamoDB command shapes (mocks `db` at `../../../db/index.js`)
- `tools.test.ts` — tool success / structured-error paths

Run with `npm run test`.

### Evals

See §11. Evals use a separate Vitest config ([vitest.eval.config.ts](../vitest.eval.config.ts)) and should not run in the default `npm run test` suite.

---

## 16. Design Principles

1. **Fresh agent per request** — never share `Agent` instances across users; prevents conversation-history leakage.
2. **Structured output validation** — every response is validated against a Zod schema before the service sees it.
3. **Proposal-first flow** — LLMs never mutate state directly; users approve, then execute.
4. **Duplicate guard** — at most one pending proposal per `(userId, agentType)`.
5. **Atomic state transitions** — DynamoDB `ConditionExpression` enforces valid status moves.
6. **Idempotent execution** — deterministic transaction IDs make retries safe.
7. **Fire-and-forget metrics** — analytics must never block the critical path.
8. **Read-only tools** — tools can only fetch; all writes go through the proposal/execute pipeline.
9. **Structured tool errors** — `{ error, message, retryable }` objects let the agent reason instead of crashing.
10. **OTel-style log correlation** — `agent.invocation_id` ULID joins logs ↔ metrics records for any single run.
