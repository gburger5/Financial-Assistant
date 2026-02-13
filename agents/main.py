import asyncio
import logging
from contextlib import asynccontextmanager

import boto3
from dotenv import dotenv_values, load_dotenv
from fastapi import FastAPI, HTTPException
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
investments_table = dynamodb.Table(env.get("INVESTMENTS_TABLE", "investments"))


# --- Request models ---


class PaycheckRequest(BaseModel):
    userId: str
    amount: float


class OverspendRequest(BaseModel):
    userId: str


class OnboardRequest(BaseModel):
    userId: str
    income: float
    goals: dict = {}


class ProposalResponse(BaseModel):
    proposalId: str
    userId: str
    type: str  # "budget", "debt", "investing"
    approved: bool
    reason: str | None = None


# --- Helpers ---


def get_user(user_id: str) -> dict:
    response = users_table.get_item(Key={"userId": user_id})
    return response.get("Item", {})


def get_goals(user_id: str) -> dict:
    response = goals_table.get_item(Key={"userId": user_id})
    item = response.get("Item", {})
    return item.get("goals", {})


def get_debts(user_id: str) -> list:
    from boto3.dynamodb.conditions import Key as DKey

    response = debts_table.query(KeyConditionExpression=DKey("userId").eq(user_id))
    return response.get("Items", [])


def get_investments(user_id: str) -> list:
    from boto3.dynamodb.conditions import Key as DKey

    response = investments_table.query(KeyConditionExpression=DKey("userId").eq(user_id))
    return response.get("Items", [])


def get_proposal(proposal_id: str) -> dict:
    response = proposals_table.get_item(Key={"proposalId": proposal_id})
    item = response.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail=f"Proposal {proposal_id} not found")
    return item


# --- App ---


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_telemetry()
    logger.info("Financial agents service started")
    yield
    logger.info("Financial agents service shutting down")


app = FastAPI(title="Financial Agents", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "agents": ["budget", "debt", "investing"]}


@app.post("/workflow/paycheck")
async def paycheck(payload: PaycheckRequest):
    """Stage 1: Paycheck detected — invoke Budget Agent only."""
    from agents.budget import budget_agent

    user = get_user(payload.userId)
    goals = get_goals(payload.userId)
    debts = get_debts(payload.userId)

    result = budget_agent(
        f"Paycheck of ${payload.amount} received for user {payload.userId}. "
        f"User profile: {user}. "
        f"Current goals: {goals}. "
        f"Current debts: {debts}. "
        f"Analyse their spending and propose a budget allocation. "
        f"Submit your proposal via submit_budget_proposal."
    )
    return {"result": str(result)}


@app.post("/workflow/overspend")
async def overspend(payload: OverspendRequest):
    """Critical overspend detected — invoke Budget Agent to re-evaluate."""
    from agents.budget import budget_agent

    user = get_user(payload.userId)
    goals = get_goals(payload.userId)
    debts = get_debts(payload.userId)

    result = budget_agent(
        f"Critical overspend detected for user {payload.userId}. "
        f"User profile: {user}. "
        f"Current goals: {goals}. "
        f"Current debts: {debts}. "
        f"Re-evaluate the budget with spending cuts. "
        f"Submit your revised proposal via submit_budget_proposal."
    )
    return {"result": str(result)}


@app.post("/workflow/onboard")
async def onboard(payload: OnboardRequest):
    """New user — Budget Agent creates initial budget proposal after Plaid connect."""
    from agents.budget import budget_agent

    user = get_user(payload.userId)
    goals = payload.goals or get_goals(payload.userId)
    debts = get_debts(payload.userId)

    result = budget_agent(
        f"Create an initial budget for user {payload.userId}. "
        f"Income: ${payload.income}/month. "
        f"User profile: {user}. "
        f"Goals: {goals}. "
        f"Current debts: {debts}. "
        f"Propose a budget allocation. "
        f"Submit your proposal via submit_budget_proposal."
    )
    return {"result": str(result)}


@app.post("/proposal/respond")
async def respond_to_proposal(payload: ProposalResponse):
    """Handle user's accept/reject response to any proposal.

    Budget approval triggers Stage 2 — Debt + Investing agents run in parallel.
    """
    from agents.budget import budget_agent
    from agents.debt import debt_agent
    from agents.investing import investing_agent

    proposal = get_proposal(payload.proposalId)
    goals = get_goals(payload.userId)

    if payload.approved:
        # Mark proposal as approved
        proposals_table.update_item(
            Key={"proposalId": payload.proposalId},
            UpdateExpression="SET #s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": "approved"},
        )

    if payload.type == "budget":
        if payload.approved:
            # Execute budget
            budget_result = budget_agent(
                f"Proposal {payload.proposalId} for user {payload.userId} has been APPROVED. "
                f"Execute the budget now using execute_budget."
            )

            # Read approved budget allocations
            approved = get_proposal(payload.proposalId)
            debt_allocation = float(approved.get("payload", {}).get("debtAllocation", 0))
            investing_allocation = float(
                approved.get("payload", {}).get("investingAllocation", 0)
            )

            # Stage 2: Invoke Debt and Investing agents in parallel
            user = get_user(payload.userId)
            debts = get_debts(payload.userId)
            investments = get_investments(payload.userId)

            loop = asyncio.get_event_loop()
            debt_task = loop.run_in_executor(
                None,
                lambda: debt_agent(
                    f"Budget approved for user {payload.userId}. "
                    f"Debt allocation: ${debt_allocation} per pay period. "
                    f"User profile: {user}. "
                    f"Goals: {goals}. "
                    f"Current debts: {debts}. "
                    f"Calculate the best allocation and submit "
                    f"your proposal via submit_debt_allocation."
                ),
            )
            invest_task = loop.run_in_executor(
                None,
                lambda: investing_agent(
                    f"Budget approved for user {payload.userId}. "
                    f"Investing allocation: ${investing_allocation} per pay period. "
                    f"User profile: {user}. "
                    f"Goals: {goals}. "
                    f"Current investments: {investments}. "
                    f"Calculate the best allocation and submit "
                    f"your proposal via submit_investment_allocation."
                ),
            )
            debt_result, invest_result = await asyncio.gather(debt_task, invest_task)

            return {
                "stage": "budget_approved_downstream_triggered",
                "proposalId": payload.proposalId,
                "budgetResult": str(budget_result),
                "debtResult": str(debt_result),
                "investingResult": str(invest_result),
            }
        else:
            # Budget rejected — revise
            proposals_table.update_item(
                Key={"proposalId": payload.proposalId},
                UpdateExpression="SET #s = :status, rejectionReason = :reason",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":status": "rejected",
                    ":reason": payload.reason or "",
                },
            )
            result = budget_agent(
                f"Your budget proposal {payload.proposalId} for user {payload.userId} "
                f'has been REJECTED. Reason: "{payload.reason}". '
                f"Here are their goals: {goals}. "
                f"Address the user's concern and submit a revised budget "
                f"via submit_budget_proposal."
            )
            return {"result": str(result), "proposalId": payload.proposalId, "approved": False}

    elif payload.type == "debt":
        if payload.approved:
            result = debt_agent(
                f"Proposal {payload.proposalId} for user {payload.userId} has been APPROVED. "
                f"Execute the debt payments now using execute_debt_payments."
            )
        else:
            proposals_table.update_item(
                Key={"proposalId": payload.proposalId},
                UpdateExpression="SET #s = :status, rejectionReason = :reason",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":status": "rejected",
                    ":reason": payload.reason or "",
                },
            )
            result = debt_agent(
                f"Your debt allocation proposal {payload.proposalId} for user {payload.userId} "
                f'has been REJECTED. Reason: "{payload.reason}". '
                f"Here are their goals: {goals}. "
                f"Address the user's concern and submit a revised allocation "
                f"via submit_debt_allocation."
            )
        return {"result": str(result), "proposalId": payload.proposalId, "approved": payload.approved}

    elif payload.type == "investing":
        if payload.approved:
            result = investing_agent(
                f"Proposal {payload.proposalId} for user {payload.userId} has been APPROVED. "
                f"Execute the investment contributions now using execute_investment_contributions."
            )
        else:
            proposals_table.update_item(
                Key={"proposalId": payload.proposalId},
                UpdateExpression="SET #s = :status, rejectionReason = :reason",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":status": "rejected",
                    ":reason": payload.reason or "",
                },
            )
            result = investing_agent(
                f"Your investment allocation proposal {payload.proposalId} for user {payload.userId} "
                f'has been REJECTED. Reason: "{payload.reason}". '
                f"Here are their goals: {goals}. "
                f"Address the user's concern and submit a revised allocation "
                f"via submit_investment_allocation."
            )
        return {"result": str(result), "proposalId": payload.proposalId, "approved": payload.approved}

    else:
        raise HTTPException(status_code=400, detail=f"Unknown proposal type: {payload.type}")
