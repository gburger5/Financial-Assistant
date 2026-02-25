# Infrastructure Overview

All AWS resources are managed by Terraform (`/terraform`) and deployed to `us-east-1`.

---

## Architecture

```
User
 ├── CloudFront → S3          (React app)
 ├── API Gateway → Lambda     (auth / users)
 └── ALB → ECS Fargate        (AI agents)
```

---

## Components

### Frontend
- **S3** hosts the production React build
- **CloudFront** serves it globally over HTTPS with edge caching
- The S3 bucket is private — CloudFront accesses it via Origin Access Control (OAC)
- 403/404 errors redirect to `index.html` for SPA routing

### API (Auth & Users)
- **Lambda** runs the Fastify server (Node.js 20), bundled with esbuild
- **API Gateway** (HTTP API v2) routes all requests to Lambda
- Handles registration, login, and JWT verification
- JWT secret and frontend URL are pulled from SSM Parameter Store at runtime
- Terraform manages infrastructure only — CI/CD deploys code updates

**Endpoints:**
- `GET /health` — health check
- `POST /register` — create account
- `POST /login` — returns a JWT on success
- `GET /verify` — validates a JWT (`Authorization: Bearer <token>`)

### AI Agents
- **ECS Fargate** runs the agents service (512 CPU / 1024 MB)
- **ECR** stores the Docker image — a new image is pushed on every deploy
- **ALB** routes traffic to ECS with a 300s idle timeout for long AI calls
- Three agents: budget, debt, investing (FastAPI / Python)

### Database
All tables use DynamoDB with on-demand billing.

| Table | Partition Key | Sort Key | Notes |
|---|---|---|---|
| `users` | `id` | — | Has GSI on `email` for login lookups |
| `goals` | `userId` | — | |
| `proposals` | `proposalId` | — | |
| `debts` | `userId` | `debtId` | |
| `investments` | `userId` | `accountId` | |

### Secrets & Config
| Store | Key | Used By |
|---|---|---|
| Secrets Manager | `financial-assistant/anthropic-api-key` | ECS agents |
| SSM Parameter Store | `/myapp/jwt-secret` | Lambda |
| SSM Parameter Store | `/myapp/frontend-url` | Lambda (CORS) |

### Networking
- ALB security group: allows inbound HTTP (port 80) from anywhere - To be changed to HTTPS
- ECS task security group: allows port 8080 from the ALB only; all outbound allowed
- HTTPS on the ALB can be enabled later by setting `domain_name` and `route53_zone_id` in Terraform

---

## CI/CD

Two parallel jobs run on every push to `main`:

1. **build-and-deploy** — lints, tests, builds the frontend and server, deploys frontend to S3/CloudFront, bundles Lambda with esbuild and pushes the new code
2. **deploy-agents** — builds the Docker image, pushes to ECR, force-redeploys the ECS service

### GitHub Secrets
| Secret | Description |
|---|---|
| `AWS_ROLE_ARN` | IAM role for OIDC authentication |
| `JWT_SECRET` | Used during server tests |
| `ECR_REPOSITORY` | Full ECR repo URI |

### GitHub Variables
| Variable | Description |
|---|---|
| `AWS_REGION` | Deployment region |
| `VITE_API_URL` | API Gateway invoke URL |
| `FRONTEND_BUCKET_NAME` | S3 bucket for the frontend |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution |
| `LAMBDA_FUNCTION_NAME` | Lambda function name |
| `ECS_CLUSTER` | ECS cluster name |
| `ECS_SERVICE` | ECS service name |

---

## Terraform State

Remote state is stored in S3 with native file locking. See `terraform/main.tf` for the backend configuration.