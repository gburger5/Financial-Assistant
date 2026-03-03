import logging
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from strands import tool

logger = logging.getLogger(__name__)

dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
proposals_table = dynamodb.Table(os.environ.get("PROPOSALS_TABLE", "proposals"))


@tool
def submit_budget_proposal(
    user_id: str,
    summary: str,
    income: float,
    rent_or_mortgage: float,
    utilities: float,
    car_payment: float,
    gas_fuel: float,
    groceries: float,
    personal_care: float,
    takeout: float,
    shopping: float,
    investing_monthly: float,
    debt_minimum_payments: float,
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
        rent_or_mortgage: Recommended monthly rent or mortgage payment
        utilities: Recommended monthly utilities (electric, gas, water, internet, phone)
        car_payment: Recommended monthly car payment
        gas_fuel: Recommended monthly gas and fuel
        groceries: Recommended monthly groceries
        personal_care: Recommended monthly personal care
        takeout: Recommended monthly takeout and restaurants
        shopping: Recommended monthly shopping
        investing_monthly: Recommended monthly investment contribution
        debt_minimum_payments: Recommended monthly debt minimum payments
        debt_allocation: Total amount allocated to debt repayment passed to Debt Agent
        investing_allocation: Total amount allocated to investing passed to Investing Agent
        emergency_fund_monthly: Monthly emergency fund contribution
        savings_goals_monthly: Monthly savings goals contribution
        smart_goals: List of SMART goal recommendations
        violations: List of hard-fast rule violations detected
        rationale: Why you chose this specific split reference user goals when relevant
    """
    logger.info("submit_budget_proposal called for user %s income=%.2f", user_id, income)
    now = datetime.now(timezone.utc).isoformat()
    proposal_id = str(uuid.uuid4())

    def d(v: float) -> Decimal:
        return Decimal(str(v))

    budget = {
        "userId": user_id,
        "budgetId": f"budget#{uuid.uuid4()}",
        "name": "Agent Recommended Budget",
        "status": "PENDING",
        "createdAt": now,
        "updatedAt": now,
        "income": {"monthlyNet": d(income)},
        "needs": {
            "housing": {"rentOrMortgage": d(rent_or_mortgage)},
            "utilities": {"utilities": d(utilities)},
            "transportation": {"carPayment": d(car_payment), "gasFuel": d(gas_fuel)},
            "other": {"groceries": d(groceries), "personalCare": d(personal_care)},
        },
        "wants": {"takeout": d(takeout), "shopping": d(shopping)},
        "investments": {"monthlyContribution": d(investing_monthly)},
        "debts": {"minimumPayments": d(debt_minimum_payments)},
    }

    item = {
        "proposalId": proposal_id,
        "userId": user_id,
        "type": "budget",
        "status": "pending",
        "summary": summary,
        "rationale": rationale,
        "payload": {
            "income": str(income),
            "needs": {
                "housing": str(rent_or_mortgage),
                "utilities": str(utilities),
                "carPayment": str(car_payment),
                "gasFuel": str(gas_fuel),
                "groceries": str(groceries),
                "personalCare": str(personal_care),
            },
            "wants": {"takeout": str(takeout), "shopping": str(shopping)},
            "debtAllocation": str(debt_allocation),
            "investingAllocation": str(investing_allocation),
            "emergencyFundMonthly": str(emergency_fund_monthly),
            "savingsGoalsMonthly": str(savings_goals_monthly),
            "smartGoals": smart_goals,
            "violations": violations,
        },
        "budget": budget,
        "totalAllocation": str(round(debt_allocation + investing_allocation, 2)),
        "createdAt": now,
        "updatedAt": now,
    }

    try:
        proposals_table.put_item(Item=item)
        logger.info("Proposal %s written to DynamoDB for user %s", proposal_id, user_id)
    except Exception as e:
        logger.error("Failed to write proposal to DynamoDB: %s", e, exc_info=True)
        raise

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


