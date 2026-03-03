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
def submit_investment_allocation(
    user_id: str,
    summary: str,
    k401_monthly: float,
    ira_monthly: float,
    ira_type: str,
    fund_allocation: dict,
    total_allocation: float,
    rationale: str,
    plaid_transactions: list,
) -> dict:
    """Submit a per-paycheck investment allocation proposal for user approval. Stores the proposal in DynamoDB with status pending.

    Args:
        user_id: The user's unique identifier
        summary: Human-readable breakdown shown to the user
        k401_monthly: Dollar amount going to 401k this period
        ira_monthly: Dollar amount going to IRA this period
        ira_type: One of roth_ira traditional_ira backdoor_roth or partial_roth_ira
        fund_allocation: Three-fund split as a flat dict mapping ticker symbol to dollar amount (e.g. {"SWTSX": 960.0, "SCHI": 240.0}). Values must be plain numbers — do not nest dicts.
        total_allocation: The total investing budget received from the Budget Agent
        rationale: Why you chose this specific split
        plaid_transactions: List of PlaidInvestTransaction objects — one per account receiving a contribution.
            Each must have: account_id, amount, account_name, contribution_type ("401k", "roth_ira",
            "traditional_ira", or "brokerage"), fund_ticker (null if not applicable), fund_name
            (null if not applicable), and scheduled_date (ISO date string, first of next month).
            Sum of all amounts must equal total_allocation exactly.
    """
    logger.info("submit_investment_allocation called for user %s total=%.2f", user_id, total_allocation)
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
        "plaidTransactions": plaid_transactions,
        "totalAllocation": str(total_allocation),
        "createdAt": now,
        "updatedAt": now,
    }

    try:
        proposals_table.put_item(Item=item)
        logger.info("Investing proposal %s written to DynamoDB for user %s", proposal_id, user_id)
    except Exception as e:
        logger.error("Failed to write investing proposal to DynamoDB: %s", e, exc_info=True)
        raise

    return {
        "proposalId": proposal_id,
        "userId": user_id,
        "type": "investing",
        "status": "pending",
        "summary": summary,
        "totalAllocation": total_allocation,
        "createdAt": now,
    }


