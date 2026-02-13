import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from dotenv import dotenv_values
from strands import tool

env = dotenv_values()
dynamodb = boto3.resource("dynamodb", region_name=env.get("AWS_DEFAULT_REGION", "us-east-1"))
proposals_table = dynamodb.Table(env.get("PROPOSALS_TABLE", "proposals"))
investments_table = dynamodb.Table(env.get("INVESTMENTS_TABLE", "investments"))


@tool
def send_suggestion(user_id: str, message: str) -> dict:
    """Send a suggestion or educational note to the user.

    Args:
        user_id: The user's unique identifier
        message: The suggestion message to send
    """
    return {"sent": True, "userId": user_id, "message": message}


@tool
def submit_investment_allocation(
    user_id: str,
    summary: str,
    k401_monthly: float,
    ira_monthly: float,
    ira_type: str,
    fund_allocation: dict,
    total_allocation: float,
    rationale: str,
) -> dict:
    """Submit a per-paycheck investment allocation proposal for user approval. Stores the proposal in DynamoDB with status pending.

    Args:
        user_id: The user's unique identifier
        summary: Human-readable breakdown shown to the user
        k401_monthly: Dollar amount going to 401k this period
        ira_monthly: Dollar amount going to IRA this period
        ira_type: One of roth_ira traditional_ira backdoor_roth or partial_roth_ira
        fund_allocation: Three-fund split with per-fund dollar amounts
        total_allocation: The total investing budget received from the Budget Agent
        rationale: Why you chose this specific split
    """
    now = datetime.now(timezone.utc).isoformat()
    proposal_id = str(uuid.uuid4())

    item = {
        "proposalId": proposal_id,
        "userId": user_id,
        "type": "investing",
        "status": "pending",
        "summary": summary,
        "rationale": rationale,
        "payload": {
            "k401Monthly": str(k401_monthly),
            "iraMonthly": str(ira_monthly),
            "iraType": ira_type,
            "fundAllocation": {k: str(v) for k, v in fund_allocation.items()},
            "totalAllocation": str(total_allocation),
        },
        "totalAllocation": str(total_allocation),
        "createdAt": now,
        "updatedAt": now,
    }

    proposals_table.put_item(Item=item)

    return {
        "proposalId": proposal_id,
        "userId": user_id,
        "type": "investing",
        "status": "pending",
        "summary": summary,
        "totalAllocation": total_allocation,
        "createdAt": now,
    }


@tool
def execute_investment_contributions(
    user_id: str,
    proposal_id: str,
    k401_monthly: float,
    ira_monthly: float,
    ira_type: str,
    fund_allocation: dict,
    total_allocation: float,
) -> dict:
    """Execute an approved investment allocation. ONLY call this after the user has approved the proposal.

    Updates 401k and IRA contribution amounts in the DynamoDB investments table, allocates
    dollars across the three-fund split, records contribution transactions, and marks the
    proposal as executed. Raises ValueError if the proposal status is not approved.

    Args:
        user_id: The user's unique identifier
        proposal_id: The proposal ID to execute
        k401_monthly: Dollar amount going to 401k
        ira_monthly: Dollar amount going to IRA
        ira_type: One of roth_ira traditional_ira backdoor_roth or partial_roth_ira
        fund_allocation: Three-fund split with per-fund dollar amounts
        total_allocation: The total amount being contributed
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

    # Update 401k account
    if k401_monthly > 0:
        investments_table.update_item(
            Key={"userId": user_id, "accountId": "401k"},
            UpdateExpression="SET balance = if_not_exists(balance, :zero) + :amount, lastContributionDate = :now, updatedAt = :now",
            ExpressionAttributeValues={
                ":amount": Decimal(str(k401_monthly)),
                ":zero": Decimal("0"),
                ":now": now,
            },
        )

    # Update IRA account
    if ira_monthly > 0:
        investments_table.update_item(
            Key={"userId": user_id, "accountId": "ira"},
            UpdateExpression="SET balance = if_not_exists(balance, :zero) + :amount, iraType = :ira_type, lastContributionDate = :now, updatedAt = :now",
            ExpressionAttributeValues={
                ":amount": Decimal(str(ira_monthly)),
                ":zero": Decimal("0"),
                ":ira_type": ira_type,
                ":now": now,
            },
        )

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
        "k401Contributed": round(k401_monthly, 2),
        "iraContributed": round(ira_monthly, 2),
        "iraType": ira_type,
        "totalContributed": round(total_allocation, 2),
        "executedAt": now,
    }
