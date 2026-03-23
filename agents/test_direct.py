# agents/test_direct.py
import json
from agents.budget import make_budget_agent

agent = make_budget_agent()
result = agent(
    "Analyze the following actual spending budget for user test-user-123 "
    "and propose an improved budget following the 50/30/20 rule. "
    f"Current budget (actual spending from the past 60 days): {json.dumps({
        'income': {'salary': 7000},
        'needs': {'housing': 2100, 'utilities': 200, 'groceries': 500, 'transportation': 300},
        'wants': {'dining': 400, 'entertainment': 200, 'subscriptions': 50},
        'debts': {'credit_card': 250, 'student_loan': 350}
    })}. "
    "User profile: {'firstName': 'Test', 'email': 'test@example.com'}. "
    "Goals: {'emergency_fund': {'target': 10000, 'current': 2000}}. "
    "Current debts: [{'name': 'Credit Card', 'balance': 5000, 'rate': 22.99, 'minimum': 150}]. "
    "Submit your proposal via submit_budget_proposal."
)
print(result)
