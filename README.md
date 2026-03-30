# FinanceAI

A multi-agent personal financial assistant. Link your bank accounts via Plaid and let autonomous AI agents analyze your spending, investments, and debt. Generate and execute personalized financial proposals on your behalf.

Users can connect multiple bank accounts, view real-time transaction history, track budgets by category, monitor investment holdings across brokerage accounts, and receive AI-generated proposals from three specialized agents (budget, debt, and investing) that can be approved or rejected before any changes are applied.

## Stack

| | |
|---|---|
| Frontend | React 18, Vite, TypeScript |
| Backend | Node.js 20, Fastify 5, TypeScript |
| AI Agents | Strands SDK (Anthropic Claude), runs inside Lambda |
| Database | DynamoDB |
| Infrastructure | AWS — CloudFront, S3, API Gateway, Lambda |
| IaC | Terraform |

## Project Structure

```
financial-assistant/
├── client/
│   └── src/
│       ├── components/
│       │   ├── charts/       # BarChart, DonutChart, LineChart
│       │   ├── features/     # ProposalCard, StatCard, TransactionRow, ...
│       │   ├── layout/       # AppShell, Sidebar, TopBar
│       │   └── ui/           # Button, Modal, Input, DataTable, ...
│       ├── pages/            # Dashboard, Budget, Savings, Proposals, Profile, ...
│       ├── hooks/            # useApi, useAuth, useBudget, useProposals
│       ├── context/          # AuthContext
│       ├── services/         # api.ts — fetch wrapper with auth headers
│       ├── types/            # TypeScript types (account, budget, transaction, ...)
│       └── styles/           # global.css, tokens.css, animations.css
│
├── server/
│   └── src/
│       ├── app.ts            # Fastify app factory (plugins, routes)
│       ├── lambda.ts         # AWS Lambda entry point
│       ├── modules/
│       │   ├── auth/         # Register, login, refresh, password reset
│       │   ├── plaid/        # Link tokens, account sync, webhooks
│       │   ├── accounts/     # Linked bank accounts
│       │   ├── transactions/ # Transaction history
│       │   ├── budget/       # Budget management and spending analysis
│       │   ├── investments/  # Holdings and investment transactions
│       │   ├── liabilities/  # Debt accounts (credit cards, loans)
│       │   ├── items/        # Plaid items (bank connections)
│       │   └── agents/       # AI agents — budget-agent, debt-agent, investing-agent
│       ├── plugins/          # auth.plugin, errorHandler.plugin
│       ├── lib/              # email, encryption, logger, plaidClient, errors
│       └── db/               # DynamoDB client and table definitions
│
└── terraform/                # All AWS infrastructure
    ├── frontend.tf           # S3 + CloudFront
    ├── lambda.tf             # API Gateway + Lambda
    ├── dynamodb.tf           # DynamoDB tables
    ├── ecs.tf / ecr.tf       # Container infrastructure
    ├── alb.tf                # Application Load Balancer
    ├── networking.tf         # VPC, subnets, security groups
    └── iam.tf                # Roles and policies
```

## Prerequisites

- **Node.js 20+** — https://nodejs.org/en/download
- **npm 10+**
- **Docker Desktop** (for DynamoDB Local) — https://www.docker.com/products/docker-desktop
- **AWS CLI** — https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

## Setup

### 1. Clone and install

```sh
git clone https://github.com/gburger5/Financial-Assistant
cd Financial-Assistant
npm install
```

### 2. Environment variables

```sh
cp server/.env.example server/.env   # macOS/Linux
copy server\.env.example server\.env # Windows
```

Key variables in `server/.env`:

```sh
PORT=3000
NODE_ENV=development
JWT_SECRET=                 # any random string
FRONTEND_URL=http://localhost:5173

ANTHROPIC_API_KEY=          # required for AI agent proposals

BREVO_API_KEY=              # required for password reset emails
EMAIL_FROM=
EMAIL_FROM_NAME=

PLAID_CLIENT_ID=            # required for bank account linking
PLAID_SECRET=
PLAID_ENV=sandbox

AWS_REGION=us-east-1
```

### 3. AWS credentials

Required depending on which features you are working on. Once you have your access keys:

```sh
aws configure
```

```
AWS Access Key ID: <your key>
AWS Secret Access Key: <your secret>
Default region name: us-east-1
Default output format: json
```

Verify with:

```sh
aws sts get-caller-identity
```

## Development

```sh
# 1. Start DynamoDB Local (Docker Desktop must be running)
docker compose up -d dynamodb-local

# 2. Create tables (first time only)
cd server && npx tsx src/scripts/setup-tables.ts && cd ..

# 3. Start frontend + backend
npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3000 |

```sh
# Stop
Ctrl + C
docker compose stop dynamodb-local
```

## Scripts

```sh
npm run dev      # start client + server with hot reload
npm run build    # production build
npm run lint     # ESLint
npm run test     # full test suite
```

## Plaid Sandbox

Three preconfigured sandbox users for testing (any password, any MFA):

| User | Bank | Accounts |
|---|---|---|
| `custom_user_depository` | Chase | Checking, High-Yield Savings |
| `custom_user_investments` | Charles Schwab | Roth 401(k), Roth IRA |
| `custom_user_debts` | First Platypus Bank | Credit cards, Student loan |

Full transaction details: [`server/src/data/plaid-sandbox-users.md`](server/src/data/plaid-sandbox-users.md)

## Deployment

Push to `main` triggers GitHub Actions: lint → test → build → deploy frontend to S3/CloudFront → bundle and deploy Lambda.

**Production:** https://d1hpk0u9qgnsex.cloudfront.net

### GitHub Secrets

| Secret | |
|---|---|
| `AWS_ROLE_ARN` | IAM role for OIDC auth |
| `JWT_SECRET` | Used in CI tests |
| `BREVO_API_KEY` | Used in CI tests |

### GitHub Variables

| Variable | |
|---|---|
| `AWS_REGION` | |
| `VITE_API_URL` | API Gateway URL, injected at build time |
| `FRONTEND_BUCKET_NAME` | |
| `CLOUDFRONT_DISTRIBUTION_ID` | |
| `LAMBDA_FUNCTION_NAME` | |
| `DYNAMODB_ENDPOINT` | Local DynamoDB for CI tests |

## Pull Requests

1. Branch from `main`:

```sh
git checkout main
git pull
git checkout -b feature/<short-description>
```

2. Make your changes and commit:

```sh
git add .
git commit -m "<short description>"
```

3. Push your branch:

```sh
git push -u origin feature/<short-description>
```

4. Open a pull request to `main`. Confirm `npm run lint`, `npm run test`, and `npm run build` all pass before requesting review.
