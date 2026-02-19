# FinanceAI
The proposed project is a multi-agent personal financial assistant designed to help users manage and optimize their finances. Each autonomous agent focuses on a specific aspect of a user’s finances budgeting, savings, investments, and debt repayment. The agents communicate and coordinate to provide a holistic view of financial health, optimize resource allocation, and offer personalized recommendations.

### Project Structure
```
financial-assistant/
├── client/          # Frontend (React + Vite)
│   ├── src/
│   ├── public/
│   └── package.json
└── server/          # Backend (Fastify + TypeScript)
    ├── src/
    └── package.json
```

### Requirements
* Node.js 20+ - https://nodejs.org/en/download
* npm 10+
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
copy client/.env.example client/.env
```
#### macOS/Linux
```sh
cp server/.env.example server/.env
cp client/.env.example client/.env
```

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
1. Start frontend and backend:
```sh
npm run dev
```

* Frontend: http://localhost:5173
* Backend: http://localhost:4000

#### Stop servers:
* Ctrl + C

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
git checkout -b features/<short-description>
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

3. Confirm npm run lint and npm run build pass

4. After approval, merge into main.
