import json
import logging
from contextlib import asynccontextmanager

import boto3
from boto3.dynamodb.conditions import Attr
from dotenv import dotenv_values, load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from telemetry import setup_telemetry

load_dotenv()  # sets env vars (ANTHROPIC_API_KEY etc.) for SDKs that read os.environ
env = dotenv_values()
logger = logging.getLogger(__name__)

dynamodb = boto3.resource("dynamodb", region_name=env.get("AWS_DEFAULT_REGION", "us-east-1"))
users_table = dynamodb.Table(env.get("USERS_TABLE", "users"))
goals_table = dynamodb.Table(env.get("GOALS_TABLE", "goals"))
proposals_table = dynamodb.Table(env.get("PROPOSALS_TABLE", "proposals"))
debts_table = dynamodb.Table(env.get("DEBTS_TABLE", "debts"))


# --- Request models ---


class BudgetAnalysisRequest(BaseModel):
    userId: str
    budget: dict


class BudgetRevisionRequest(BaseModel):
    userId: str
    proposalId: str
    budget: dict
    rejectionReason: str


class DebtAgentRunRequest(BaseModel):
    userId: str
    debtAllocation: float
    debts: list  # List of DebtAccount dicts from Plaid
    rejectionReason: str | None = None


class InvestingAgentRunRequest(BaseModel):
    userId: str
    investingAllocation: float
    accounts: list  # List of InvestmentAccount dicts from Plaid
    userAge: int | None = None
    rejectionReason: str | None = None


# --- Helpers ---


def get_user(user_id: str) -> dict:
    response = users_table.get_item(Key={"id": user_id})
    return response.get("Item", {})


def get_goals(user_id: str) -> dict:
    response = goals_table.get_item(Key={"userId": user_id})
    item = response.get("Item", {})
    return item.get("goals", {})


def get_debts(user_id: str) -> list:
    from boto3.dynamodb.conditions import Key as DKey

    response = debts_table.query(KeyConditionExpression=DKey("userId").eq(user_id))
    return response.get("Items", [])


# --- App ---


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_telemetry()
    logger.info("Financial agents service started")
    yield
    logger.info("Financial agents service shutting down")


app = FastAPI(title="Financial Agents", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to CloudFront domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "agents": ["budget", "debt", "investing"]}


@app.post("/agent/budget")
async def agent_budget(payload: BudgetAnalysisRequest):
    """Analyze the user's actual spending budget and return an agent-proposed improvement."""
    from agents.budget import make_budget_agent

    user = get_user(payload.userId)
    goals = get_goals(payload.userId)
    debts = get_debts(payload.userId)

    agent = make_budget_agent()
    try:
        agent(
            f"Analyze the following actual spending budget for user {payload.userId} "
            f"and propose an improved budget following the 50/30/20 rule. "
            f"Current budget (actual spending from the past 60 days): {json.dumps(payload.budget)}. "
            f"User profile: {user}. "
            f"Goals: {goals}. "
            f"Current debts: {debts}. "
            f"Submit your proposal via submit_budget_proposal."
        )
    except Exception as e:
        logger.error("Budget agent raised an exception: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Agent error: {e}")

    response = proposals_table.scan(
        FilterExpression=Attr("userId").eq(payload.userId) & Attr("status").eq("pending")
    )
    items = sorted(response.get("Items", []), key=lambda x: x.get("createdAt", ""), reverse=True)

    if not items:
        raise HTTPException(status_code=500, detail="Agent did not produce a proposal")

    return items[0]


@app.post("/agent/budget/revise")
async def agent_budget_revise(payload: BudgetRevisionRequest):
    """Re-invoke the Budget Agent with a rejection reason to produce a revised proposal."""
    from agents.budget import make_budget_agent

    goals = get_goals(payload.userId)

    agent = make_budget_agent()
    agent(
        f"Your budget proposal {payload.proposalId} for user {payload.userId} "
        f'has been REJECTED. Reason: "{payload.rejectionReason}". '
        f"Original actual budget (for reference): {json.dumps(payload.budget)}. "
        f"Goals: {goals}. "
        f"Address the user's concern and submit a revised budget via submit_budget_proposal."
    )

    response = proposals_table.scan(
        FilterExpression=Attr("userId").eq(payload.userId) & Attr("status").eq("pending")
    )
    items = sorted(response.get("Items", []), key=lambda x: x.get("createdAt", ""), reverse=True)

    if not items:
        raise HTTPException(status_code=500, detail="Agent did not produce a revised proposal")

    return items[0]


@app.post("/agent/debt/run")
async def agent_debt_run(payload: DebtAgentRunRequest):
    """Invoke the Debt Agent with pre-fetched Plaid liability data and return a proposal."""
    from agents.debt import make_debt_agent

    debt_summary = json.dumps(payload.debts) if payload.debts else "No debt accounts found."
    rejection_context = (
        f'\nPrevious proposal was REJECTED. Reason: "{payload.rejectionReason}". '
        "Address the user's concern and submit a meaningfully revised allocation."
        if payload.rejectionReason
        else ""
    )

    agent = make_debt_agent()
    try:
        agent(
            f"Analyze the debt accounts for user {payload.userId} and propose an optimal "
            f"debt repayment allocation using the avalanche strategy. "
            f"Total monthly allocation for debt repayment: ${payload.debtAllocation}. "
            f"Debt accounts (from Plaid): {debt_summary}."
            f"{rejection_context} "
            f"Submit your proposal via submit_debt_allocation (include plaid_transactions)."
        )
    except Exception as e:
        logger.error("Debt agent raised an exception: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Agent error: {e}")

    response = proposals_table.scan(
        FilterExpression=Attr("userId").eq(payload.userId)
        & Attr("status").eq("pending")
        & Attr("type").eq("debt")
    )
    items = sorted(response.get("Items", []), key=lambda x: x.get("createdAt", ""), reverse=True)

    if not items:
        raise HTTPException(status_code=500, detail="Debt agent did not produce a proposal")

    return items[0]


@app.post("/agent/investing/run")
async def agent_investing_run(payload: InvestingAgentRunRequest):
    """Invoke the Investing Agent with pre-fetched Plaid holdings data and return a proposal."""
    from agents.investing import make_investing_agent

    accounts_summary = json.dumps(payload.accounts) if payload.accounts else "No investment accounts found."
    age_context = f"User age: {payload.userAge}." if payload.userAge is not None else "User age: unknown."
    rejection_context = (
        f'\nPrevious proposal was REJECTED. Reason: "{payload.rejectionReason}". '
        "Address the user's concern and submit a meaningfully revised allocation."
        if payload.rejectionReason
        else ""
    )

    agent = make_investing_agent()
    try:
        agent(
            f"Analyze the investment accounts for user {payload.userId} and propose an optimal "
            f"investing allocation following the 401k match -> IRA -> savings goals priority. "
            f"Total monthly allocation for investing: ${payload.investingAllocation}. "
            f"{age_context} "
            f"Investment accounts (from Plaid): {accounts_summary}."
            f"{rejection_context} "
            f"Submit your proposal via submit_investment_allocation (include plaid_transactions)."
        )
    except Exception as e:
        logger.error("Investing agent raised an exception: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Agent error: {e}")

    response = proposals_table.scan(
        FilterExpression=Attr("userId").eq(payload.userId)
        & Attr("status").eq("pending")
        & Attr("type").eq("investing")
    )
    items = sorted(response.get("Items", []), key=lambda x: x.get("createdAt", ""), reverse=True)

    if not items:
        raise HTTPException(status_code=500, detail="Investing agent did not produce a proposal")

    return items[0]
