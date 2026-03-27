# FinanceAI
The proposed project is a multi-agent personal financial assistant designed to help users manage and optimize their finances. Each autonomous agent focuses on a specific aspect of a user’s finances budgeting, savings, investments, and debt repayment. The agents communicate and coordinate to provide a holistic view of financial health, optimize resource allocation, and offer personalized recommendations.

### Project Structure
```
financial-assistant/
├── client/          # Frontend (React + Vite)
│   ├── src/
│   ├── public/
│   └── package.json
├── server/          # Backend (Fastify + TypeScript)
│   ├── src/
│   └── package.json
└── agents/          # Python AI agents (FastAPI + Strands)
    ├── agents/      # Agent definitions (budget, debt, investing)
    ├── tools/       # DynamoDB tool implementations
    └── main.py      # FastAPI entry point
```

### Requirements
* Node.js 20+ - https://nodejs.org/en/download
* npm 10+
* Python 3.11+
* Docker Desktop (for DynamoDB Local) - https://www.docker.com/products/docker-desktop
* AWS CLI - https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html#getting-started-install-instructions

### Setup
1. Clone the repository:
```sh
git clone https://github.com/gburger5/Financial-Assistant
```

2. Install dependencies from the repository root:
```sh
npm install
```

3. Create environment files:
#### Windows
```sh
copy server/.env.example server/.env
```
#### macOS/Linux
```sh
cp server/.env.example server/.env
```

#### Plaid Setup
Preconfigured sandbox test users with checking, savings, investment, and debt accounts are documented in [`server/src/data/plaid-sandbox-users.md`](server/src/data/plaid-sandbox-users.md).

#### Email Setup
The server sends emails via Brevo. Ensure you have a Brevo API key and set `BREVO_API_KEY`, `EMAIL_FROM`, and `EMAIL_FROM_NAME` in `server/.env`.

#### AWS Setup
An IAM user role may be required depending on what features you are working on. Once you receive your access and secret keys, configure your AWS credentials:
```sh
aws configure
```
You will be prompted for:
```sh
AWS Access Key ID: <your key>
AWS Secret Access Key: <your secret>
Default region name: us-east-1
Default output format: json
```
Verify your credentials are working:
```sh
aws sts get-caller-identity
```
You should see a JSON response with your UserId, Account, and Arn.

### Development

#### 1. Start DynamoDB Local
Docker Desktop must be running first.
```sh
docker compose up -d dynamodb-local
```

#### 2. Start frontend and backend
```sh
npm run dev
```

* Frontend: http://localhost:5173
* Backend: http://localhost:3000

#### 3. Start the agents container (optional — required for AI proposals)

The agents service runs the budget, debt, and investing AI agents. It requires an `ANTHROPIC_API_KEY`.

```sh
cd agents
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create `agents/.env`:
```sh
ANTHROPIC_API_KEY=your_key_here
DYNAMODB_ENDPOINT=http://localhost:8000
AWS_DEFAULT_REGION=us-east-1
PROPOSALS_TABLE=proposals
USERS_TABLE=Users
GOALS_TABLE=goals
DEBTS_TABLE=debts
```

Start the agents server:
```sh
cd agents
uvicorn main:app --port 8001 --reload
```

* Agents API: http://localhost:8001
* Health check: http://localhost:8001/health

> The Node.js server proxies agent requests to `http://localhost:8001` (configurable via `AGENT_SERVICE_URL` in `server/.env`). If the agents service is not running, proposal endpoints return a 502 error.

#### Stop servers:
* Ctrl + C (server/client)
* `docker compose stop dynamodb-local` (DynamoDB)

### Scripts
Start the client and server in development mode.
```sh
npm run dev
```

Runs the build script in each workspace.
```sh
npm run build
```

Runs ESLint in each workspace.
```sh
npm run lint
```

Runs Test suite in each workspace.
```sh
npm run test
```

### Pull Requests

1. Create a new feature branch from main:
```sh
git checkout main
git pull
git checkout -b feature/<short-description>
```

2. Make changes and commit:
```sh
git add .
git commit -m "<short description>"
```

3. Push your branch:
```sh
git push -u origin feature/<short-description>
```

### Open a Pull Request to main:

1. Include a clear summary of changes

2. Mention any relevant context

3. Confirm npm run lint, npm run test, and npm run build pass

4. After approval, merge into main.
