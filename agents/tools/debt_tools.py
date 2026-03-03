import logging
import os
import uuid
from datetime import datetime, timezone

import boto3
from strands import tool

logger = logging.getLogger(__name__)

dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
proposals_table = dynamodb.Table(os.environ.get("PROPOSALS_TABLE", "proposals"))


@tool
def submit_debt_allocation(
    user_id: str,
    summary: str,
    ordered_debts: list,
    total_allocation: float,
    rationale: str,
    plaid_transactions: list,
) -> dict:
    """Submit a per-paycheck debt allocation proposal for user approval. Stores the proposal in DynamoDB with status pending.

    Args:
        user_id: The user's unique identifier
        summary: Human-readable breakdown shown to the user
        ordered_debts: Ordered list of dicts with debtId name balance interestRate minimumPayment and paymentAmount for each debt
        total_allocation: The total debt budget received from the Budget Agent
        rationale: Why you chose this specific split
        plaid_transactions: List of PlaidDebtTransaction objects — one per debt receiving a payment.
            Each must have: account_id, amount, debt_name, payment_type ("minimum", "extra", or "payoff"),
            and scheduled_date (ISO date string, set to first of next month).
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
        "plaidTransactions": plaid_transactions,
        "totalAllocation": str(total_allocation),
        "createdAt": now,
        "updatedAt": now,
    }

    try:
        proposals_table.put_item(Item=item)
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


