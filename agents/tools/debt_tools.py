import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from dotenv import dotenv_values
from strands import tool

env = dotenv_values()
dynamodb = boto3.resource("dynamodb", region_name=env.get("AWS_DEFAULT_REGION", "us-east-1"))
proposals_table = dynamodb.Table(env.get("PROPOSALS_TABLE", "proposals"))
debts_table = dynamodb.Table(env.get("DEBTS_TABLE", "debts"))


@tool
def send_suggestion(user_id: str, message: str) -> dict:
    """Send a suggestion or motivation message to the user.

    Args:
        user_id: The user's unique identifier
        message: The suggestion message to send
    """
    return {"sent": True, "userId": user_id, "message": message}


@tool
def submit_debt_allocation(
    user_id: str,
    summary: str,
    ordered_debts: list,
    total_allocation: float,
    rationale: str,
) -> dict:
    """Submit a per-paycheck debt allocation proposal for user approval. Stores the proposal in DynamoDB with status pending.

    Args:
        user_id: The user's unique identifier
        summary: Human-readable breakdown shown to the user
        ordered_debts: Ordered list of dicts with debtId name balance interestRate minimumPayment and paymentAmount for each debt
        total_allocation: The total debt budget received from the Budget Agent
        rationale: Why you chose this specific split
    """
    now = datetime.now(timezone.utc).isoformat()
    proposal_id = str(uuid.uuid4())

    item = {
        "proposalId": proposal_id,
        "userId": user_id,
        "type": "debt",
        "status": "pending",
        "summary": summary,
        "rationale": rationale,
        "payload": {
            "orderedDebts": ordered_debts,
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
        "type": "debt",
        "status": "pending",
        "summary": summary,
        "totalAllocation": total_allocation,
        "createdAt": now,
    }


@tool
def execute_debt_payments(
    user_id: str,
    proposal_id: str,
    ordered_debts: list,
    total_allocation: float,
) -> dict:
    """Execute an approved debt allocation. ONLY call this after the user has approved the proposal.

    Deducts payment amount from each debt principal in the DynamoDB debts table,
    records each payment transaction with timestamp, and marks the proposal as executed.
    Raises ValueError if the proposal status is not approved.

    Args:
        user_id: The user's unique identifier
        proposal_id: The proposal ID to execute
        ordered_debts: Ordered list of dicts with debtId and paymentAmount for each debt
        total_allocation: The total amount being paid across all debts
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

    for debt in ordered_debts:
        payment = Decimal(str(debt["paymentAmount"]))
        debts_table.update_item(
            Key={"userId": user_id, "debtId": debt["debtId"]},
            UpdateExpression="SET balance = balance - :payment, lastPaymentDate = :now, updatedAt = :now",
            ExpressionAttributeValues={
                ":payment": payment,
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
        "paymentsProcessed": len(ordered_debts),
        "totalPaid": round(total_allocation, 2),
        "executedAt": now,
    }
