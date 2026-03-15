import logging
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from strands import tool

logger = logging.getLogger(__name__)


def floats_to_decimal(obj):
    """Recursively convert all float values in a nested structure to Decimal."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: floats_to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [floats_to_decimal(v) for v in obj]
    return obj

dynamodb_kwargs = {"region_name": os.environ.get("AWS_DEFAULT_REGION", "us-east-1")}
if os.environ.get("DYNAMODB_ENDPOINT"):
    dynamodb_kwargs["endpoint_url"] = os.environ["DYNAMODB_ENDPOINT"]
dynamodb = boto3.resource("dynamodb", **dynamodb_kwargs)
proposals_table = dynamodb.Table(os.environ.get("PROPOSALS_TABLE", "proposals"))


@tool
def submit_debt_allocation(
    user_id: str,
    summary: str,
    ordered_debts: list,
    total_allocation: float,
    rationale: str,
    scheduled_payments: list,
) -> dict:
    """Submit a per-paycheck debt allocation proposal for user approval. Stores the proposal in DynamoDB with status pending.

    Args:
        user_id: The user's unique identifier
        summary: Human-readable breakdown shown to the user
        ordered_debts: Ordered list of dicts with debtId name balance interestRate minimumPayment and paymentAmount for each debt
        total_allocation: The total debt budget received from the Budget Agent
        rationale: Why you chose this specific split
        scheduled_payments: List of debt payment objects — one per debt receiving a payment.
            Each must have: plaid_account_id, amount, debt_name, payment_type ("minimum", "extra", or "payoff").
            Sum of all amounts must equal total_allocation exactly.
    """
    logger.info("submit_debt_allocation called for user %s total=%.2f", user_id, total_allocation)
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
        "scheduledPayments": scheduled_payments,
        "totalAllocation": str(total_allocation),
        "createdAt": now,
        "updatedAt": now,
    }

    try:
        proposals_table.put_item(Item=floats_to_decimal(item))
        logger.info("Debt proposal %s written to DynamoDB for user %s", proposal_id, user_id)
    except Exception as e:
        logger.error("Failed to write debt proposal to DynamoDB: %s", e, exc_info=True)
        raise

    return {
        "proposalId": proposal_id,
        "userId": user_id,
        "type": "debt",
        "status": "pending",
        "summary": summary,
        "totalAllocation": total_allocation,
        "createdAt": now,
    }


