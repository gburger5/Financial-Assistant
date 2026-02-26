# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm run lint         # Run ESLint
npm run test         # Run Vitest test suite (single run)
npm run test:watch   # Run Vitest in watch mode
npm run test:coverage # Run with coverage report
npm run deploy       # Deploy via Serverless Framework
```

To run a single test file:
```bash
npx vitest run src/tests/login.test.ts
```

To create DynamoDB tables in local DynamoDB (must be running first):
```bash
npx tsx src/scripts/setup-tables.ts
```

## Architecture

This is the backend for a multi-agent personal financial assistant. It's a Fastify v5 API deployable to both a local dev server and AWS Lambda (via `@fastify/aws-lambda` + Serverless Framework).

**Dual entry points:**
- `src/server.ts` — local development server (binds to PORT)
- `src/lambda.ts` — AWS Lambda handler exported for API Gateway

**App structure:**
- `src/app.ts` — Fastify app factory: registers CORS, rate limiting, and all routes
- `src/services/auth.ts` — Business logic for register/login (bcrypt, JWT, account lockout)
- `src/services/plaid.ts` — Plaid API calls: createLinkToken, exchangePublicToken, syncTransactions
- `src/services/budget.ts` — Budget CRUD and transaction analysis (category → budget field mapping)
- `src/routes/plaid.ts` — `POST /plaid/create-link-token`, `POST /plaid/exchange-token`
- `src/routes/budget.ts` — `GET /budget`, `PUT /budget/:budgetId`, `POST /budget/:budgetId/confirm`
- `src/middleware/auth.ts` — `verifyToken` pre-handler hook that validates Bearer JWT and decorates `request.user`
- `src/lib/db.ts` — DynamoDB DocumentClient singleton (supports `DYNAMODB_ENDPOINT` for local dev)
- `src/lib/plaid.ts` — Plaid API client singleton
- `src/scripts/setup-tables.ts` — Creates `users` and `Budgets` tables in local DynamoDB

**Database:** AWS DynamoDB with two tables:
- `users` — PK: `id`, GSI: `email-index` on `email`. Includes `plaid.*` and `onboarding.*` nested fields.
- `Budgets` — PK: `userId`, SK: `budgetId` (`budget#<ULID>`). Stores analyzed/confirmed budget.

In development, DynamoDB Local is used. Set `DYNAMODB_ENDPOINT=http://localhost:8000` and run `npx tsx src/scripts/setup-tables.ts` to initialize.

**Auth flow:**
1. Register: validate input → hash password (bcrypt, 10 rounds) → store in DynamoDB with UUID
2. Login: query by email via GSI → verify password → check/update account lockout → issue JWT (7-day expiry)
3. Protected routes: `verifyToken` middleware validates Bearer token, sets `request.user` with `{ userId, email, firstName, lastName }`

**Account lockout:** 5 failed attempts triggers a 15-minute lockout, tracked in `failedLoginAttempts` and `accountLockedUntil` fields on the user record.

**Rate limiting:** Global 100 req/15 min; `/register` and `/login` are limited to 5 req/15 min.

**Deployment:** `serverless.yml` configures AWS Lambda (Node 24.x, us-east-1) with a catch-all `/{proxy+}` route. Secrets (`JWT_SECRET`, `FRONTEND_URL`) are pulled from AWS SSM Parameter Store at deploy time.

## Environment Variables

See `.env.example`. Required vars:
- `PORT` — local dev port
- `NODE_ENV` — environment (non-`production` allows JWT fallback to `'test-secret-key'`)
- `JWT_SECRET` — secret for signing JWTs
- `FRONTEND_URL` — allowed CORS origin (default: `http://localhost:5173`; use `http://localhost:5500` for VS Code Live Server)
- `PLAID_CLIENT_ID` — from Plaid developer dashboard
- `PLAID_SECRET` — from Plaid developer dashboard (sandbox secret)
- `PLAID_ENV` — `sandbox`, `development`, or `production` (default: `sandbox`)
- `DYNAMODB_ENDPOINT` — local DynamoDB endpoint (e.g. `http://localhost:8000`); omit to use AWS
- `AWS_REGION` — region for local DynamoDB (default: `us-east-1`)

## Testing

Tests use Vitest with mocked DynamoDB (`src/tests/mocks/db.ts`) and auth mocks. Test files live in `src/tests/`. The ESLint config ignores `src/tests/` so test files are not linted.
