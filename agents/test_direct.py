# agents/test_direct.py
# Runs the budget agent without touching DynamoDB — prints the proposal to console.
from agents.budget import BUDGET_SYSTEM_PROMPT
from strands.models.anthropic import AnthropicModel
from strands import Agent, tool
import json
from dotenv import load_dotenv

load_dotenv()


@tool
def budget_proposal(
    summary: str,
    rationale: str,
    income: float,
    housing: float,
    utilities: float,
    transportation: float,
    groceries: float,
    takeout: float,
    shopping: float,
    personal_care: float,
    savings: float,
    entertainment: float,
    medical: float,
    debts: float,
    investments: float,
) -> dict:
    """Submit a budget proposal for user approval.

    Args:
        summary: Human-readable breakdown shown to the user
        rationale: Why you chose this specific split reference user goals when relevant
        income: Monthly take-home income
        housing: Recommended monthly housing (rent or mortgage)
        utilities: Recommended monthly utilities
        transportation: Recommended monthly transportation
        groceries: Recommended monthly groceries
        takeout: Recommended monthly takeout and restaurants
        shopping: Recommended monthly shopping
        personalCare: Recommended monthly personal care
        emergencyFund: Recommended monthly emergency fund contribution
        entertainment: Recommended monthly entertainment
        medical: Recommended monthly medical
        debts: Recommended monthly debt payments
        investments: Recommended monthly investment contribution
    """
    proposal = {
        "budget": {
            "income": {"amount": income},
            "housing": {"amount": housing},
            "utilities": {"amount": utilities},
            "transportation": {"amount": transportation},
            "groceries": {"amount": groceries},
            "takeout": {"amount": takeout},
            "shopping": {"amount": shopping},
            "personalCare": {"amount": personal_care},
            "emergencyFund": {"amount": savings},
            "entertainment": {"amount": entertainment},
            "medical": {"amount": medical},
            "debts": {"amount": debts},
            "investments": {"amount": investments},
            "goals": [],
        },
        "summary": summary,
        "rationale": rationale,
    }
    print("\n" + "=" * 60)
    print("BUDGET PROPOSAL")
    print("=" * 60)
    print(json.dumps(proposal, indent=2))
    print("=" * 60 + "\n")
    return {"status": "printed", "proposalId": "dry-run"}


model = AnthropicModel(model_id="claude-sonnet-4-6", max_tokens=4096)
agent = Agent(
    name="budget-agent",
    system_prompt=BUDGET_SYSTEM_PROMPT,
    tools=[budget_proposal],
    model=model,
    callback_handler=None,
)

result = agent(
    "Analyze the following actual spending budget for the user."
    "Then propose an improved budget using the budget proposal tool."
    f"Current budget (actual spending from the past 60 days): {json.dumps(
        {
            "income": {"amount": 5636.45},
            "housing": {"amount": 1500},
            "utilities": {"amount": 50},
            "transportation": {"amount": 142.14},
            "groceries": {"amount": 426.71},
            "takeout": {"amount": 106.82},
            "shopping": {"amount": 350.71},
            "personalCare": {"amount": 132.05},
            "savings": {"amount": 600},
            "entertainment": {"amount": 14.99},
            "medical": {"amount": 47.36},
            "debts": {"amount": 502},
            "investments": {"amount": 1090.03},
            "goals": []
        }
    )}. "
)
print(result)
