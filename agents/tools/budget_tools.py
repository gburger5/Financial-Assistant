import uuid
from datetime import datetime, timezone

import boto3
from dotenv import dotenv_values
from strands import tool

env = dotenv_values()
dynamodb = boto3.resource("dynamodb", region_name=env.get("AWS_DEFAULT_REGION", "us-east-1"))
proposals_table = dynamodb.Table(env.get("PROPOSALS_TABLE", "proposals"))


@tool
def submit_budget_proposal(
    user_id: str,
    summary: str,
    income: float,
    needs: dict,
    wants: dict,
    debt_allocation: float,
    investing_allocation: float,
    emergency_fund_monthly: float,
    savings_goals_monthly: float,
    smart_goals: list,
    violations: list,
    rationale: str,
) -> dict:
    """Submit a budget proposal for user approval. Stores the proposal in DynamoDB with status pending.

    Args:
        user_id: The user's unique identifier
        summary: Human-readable breakdown shown to the user
        income: Monthly take-home income
        needs: Dict of need categories and amounts e.g. rent 1200 utilities 120
        wants: Dict of want categories and amounts e.g. dining 250 streaming 40
        debt_allocation: Total amount allocated to debt repayment passed to Debt Agent
        investing_allocation: Total amount allocated to investing passed to Investing Agent
        emergency_fund_monthly: Monthly emergency fund contribution
        savings_goals_monthly: Monthly savings goals contribution
        smart_goals: List of SMART goal recommendations
        violations: List of hard-fast rule violations detected
        rationale: Why you chose this specific split reference user goals when relevant
    """
    now = datetime.now(timezone.utc).isoformat()
    proposal_id = str(uuid.uuid4())

    item = {
        "proposalId": proposal_id,
        "userId": user_id,
        "type": "budget",
        "status": "pending",
        "summary": summary,
        "rationale": rationale,
        "payload": {
            "income": str(income),
            "needs": {k: str(v) for k, v in needs.items()},
            "wants": {k: str(v) for k, v in wants.items()},
            "debtAllocation": str(debt_allocation),
            "investingAllocation": str(investing_allocation),
            "emergencyFundMonthly": str(emergency_fund_monthly),
            "savingsGoalsMonthly": str(savings_goals_monthly),
            "smartGoals": smart_goals,
            "violations": violations,
        },
        "totalAllocation": str(round(debt_allocation + investing_allocation, 2)),
        "createdAt": now,
        "updatedAt": now,
    }

    proposals_table.put_item(Item=item)

    return {
        "proposalId": proposal_id,
        "userId": user_id,
        "type": "budget",
        "status": "pending",
        "summary": summary,
        "debtAllocation": debt_allocation,
        "investingAllocation": investing_allocation,
        "totalAllocation": round(debt_allocation + investing_allocation, 2),
        "createdAt": now,
    }


@tool
def execute_budget(
    user_id: str,
    proposal_id: str,
    income: float,
    needs: dict,
    wants: dict,
    debt_allocation: float,
    investing_allocation: float,
    emergency_fund_monthly: float,
    savings_goals_monthly: float,
) -> dict:
    """Execute an approved budget. ONLY call this after the user has approved the proposal.

    Saves the approved budget to DynamoDB and signals that the Debt and Investing agents
    should run with the approved allocation amounts. Raises ValueError if the proposal
    status is not approved.

    Args:
        user_id: The user's unique identifier
        proposal_id: The proposal ID to execute
        income: Monthly take-home income
        needs: Dict of need categories and amounts
        wants: Dict of want categories and amounts
        debt_allocation: Total amount allocated to debt repayment
        investing_allocation: Total amount allocated to investing
        emergency_fund_monthly: Monthly emergency fund contribution
        savings_goals_monthly: Monthly savings goals contribution
    """
    response = proposals_table.get_item(Key={"proposalId": proposal_id})
    proposal = response.get("Item")

    if not proposal:
        raise ValueError(f"Proposal {proposal_id} not found")
    if proposal["status"] != "approved":
        raise ValueError(
            f"Proposal {proposal_id} status is '{proposal['status']}', not 'approved'"
        )

    now = datetime.now(timezone.utc).isoformat()

    proposals_table.update_item(
        Key={"proposalId": proposal_id},
        UpdateExpression="SET #s = :status, updatedAt = :now",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":status": "executed", ":now": now},
    )

    return {
        "success": True,
        "userId": user_id,
        "proposalId": proposal_id,
        "status": "executed",
        "debtAllocation": round(debt_allocation, 2),
        "investingAllocation": round(investing_allocation, 2),
        "executedAt": now,
    }


@tool
def send_suggestion(user_id: str, message: str) -> dict:
    """Send a suggestion or SMART goal recommendation to the user.

    Args:
        user_id: The user's unique identifier
        message: The suggestion message to send
    """
    return {"sent": True, "userId": user_id, "message": message}
