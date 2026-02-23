import { db } from "../lib/db.js";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import type { PlaidTransaction } from "./plaid.js";

const BUDGETS_TABLE = "Budgets";
const USERS_TABLE = "users";

// Maps a PFCv2 detailed category to one or more budget field paths.
// Field paths use dot notation matching the budget item structure.
const CATEGORY_MAP: Record<string, string[]> = {
  INCOME_SALARY:                                                    ["income.monthlyNet"],
  RENT_AND_UTILITIES_RENT:                                          ["needs.housing.rentOrMortgage"],
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY:                           ["needs.utilities.utilities"],
  RENT_AND_UTILITIES_WATER:                                         ["needs.utilities.utilities"],
  RENT_AND_UTILITIES_INTERNET_AND_CABLE:                            ["needs.utilities.utilities"],
  RENT_AND_UTILITIES_TELEPHONE:                                     ["needs.utilities.utilities"],
  LOAN_PAYMENTS_CAR_PAYMENT:                                        ["needs.transportation.carPayment"],
  TRANSPORTATION_GAS:                                               ["needs.transportation.gasFuel"],
  FOOD_AND_DRINK_GROCERIES:                                         ["needs.other.groceries"],
  PERSONAL_CARE_HAIR_AND_BEAUTY:                                    ["needs.other.personalCare"],
  FOOD_AND_DRINK_RESTAURANT:                                        ["wants.takeout"],
  FOOD_AND_DRINK_FAST_FOOD:                                         ["wants.takeout"],
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES:                          ["wants.shopping"],
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES:                     ["wants.shopping"],
  GENERAL_MERCHANDISE_SUPERSTORES:                                  ["wants.shopping"],
};

// Income categories (Plaid amounts are negative for inflows)
const INCOME_CATEGORIES = new Set(["INCOME_SALARY"]);

export interface Budget {
  userId: string;
  budgetId: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  status: "PENDING" | "REVIEWED" | "CONFIRMED";
  income: {
    monthlyNet: number | null;
  };
  needs: {
    housing: {
      rentOrMortgage: number | null;
    };
    utilities: {
      utilities: number | null;
    };
    transportation: {
      carPayment: number | null;
      gasFuel: number | null;
    };
    other: {
      groceries: number | null;
      personalCare: number | null;
    };
  };
  wants: {
    takeout: number | null;
    shopping: number | null;
  };
}

function emptyBudgetItem(userId: string): Budget {
  const now = new Date().toISOString();
  return {
    userId,
    budgetId: `budget#${ulid()}`,
    createdAt: now,
    updatedAt: now,
    name: "Monthly Budget",
    status: "PENDING",
    income: { monthlyNet: null },
    needs: {
      housing: { rentOrMortgage: null },
      utilities: { utilities: null },
      transportation: { carPayment: null, gasFuel: null },
      other: { groceries: null, personalCare: null },
    },
    wants: { takeout: null, shopping: null },
  };
}

export async function createEmptyBudget(userId: string): Promise<Budget> {
  const budget = emptyBudgetItem(userId);

  await db.send(new PutCommand({ TableName: BUDGETS_TABLE, Item: budget }));

  return budget;
}

export async function getBudget(userId: string): Promise<Budget | null> {
  const result = await db.send(
    new QueryCommand({
      TableName: BUDGETS_TABLE,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
      ScanIndexForward: false,
      Limit: 1,
    })
  );

  return (result.Items?.[0] as Budget) ?? null;
}

// Sets a deeply-nested value on an object by dot-notation path
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const parts = path.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor = cursor[parts[i]] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

export interface PlaidItem {
  accessToken: string;
  itemId: string;
  linkedAt: string;
}

export async function analyzeAndPopulateBudget(
  userId: string,
  newItem: PlaidItem,
  transactions: PlaidTransaction[]
): Promise<Budget> {
  const budget = await getBudget(userId);
  if (!budget) throw new Error("No budget found for user");

  // Accumulate totals by field path
  const totals: Record<string, number> = {};

  for (const tx of transactions) {
    const detailed = tx.personal_finance_category?.detailed;
    if (!detailed) continue;

    const fields = CATEGORY_MAP[detailed];
    if (!fields) continue;

    // Plaid: positive = debit (expense), negative = credit (income)
    const amount = INCOME_CATEGORIES.has(detailed) ? -tx.amount : tx.amount;
    if (amount <= 0) continue; // skip zero or reversed amounts

    for (const field of fields) {
      totals[field] = (totals[field] ?? 0) + amount;
    }
  }

  // Apply totals to budget object
  for (const [path, total] of Object.entries(totals)) {
    setNestedValue(budget as unknown as Record<string, unknown>, path, Math.round(total * 100) / 100);
  }

  budget.status = "PENDING";
  budget.updatedAt = new Date().toISOString();

  // Persist updated budget
  await db.send(new PutCommand({ TableName: BUDGETS_TABLE, Item: budget }));

  // Append new Plaid item to user's plaidItems list and mark onboarding flags
  const now = new Date().toISOString();
  await db.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { id: userId },
      UpdateExpression:
        "SET plaidItems = list_append(if_not_exists(plaidItems, :emptyList), :newItems), onboarding.plaidLinked = :t, onboarding.budgetAnalyzed = :t, updated_at = :now",
      ExpressionAttributeValues: {
        ":newItems": [newItem],
        ":emptyList": [],
        ":t": true,
        ":now": now,
      },
    })
  );

  return budget;
}

export async function updateBudget(
  userId: string,
  budgetId: string,
  updates: Partial<Budget>
): Promise<Budget> {
  // Fetch current, merge, and write back to avoid complex dynamic update expressions
  const result = await db.send(
    new QueryCommand({
      TableName: BUDGETS_TABLE,
      KeyConditionExpression: "userId = :uid AND budgetId = :bid",
      ExpressionAttributeValues: { ":uid": userId, ":bid": budgetId },
    })
  );

  const existing = result.Items?.[0] as Budget | undefined;
  if (!existing) throw new Error("Budget not found");

  const merged: Budget = {
    ...existing,
    ...updates,
    income: { ...existing.income, ...(updates.income ?? {}) },
    needs: {
      housing: { ...existing.needs.housing, ...(updates.needs?.housing ?? {}) },
      utilities: { ...existing.needs.utilities, ...(updates.needs?.utilities ?? {}) },
      transportation: { ...existing.needs.transportation, ...(updates.needs?.transportation ?? {}) },
      other: { ...existing.needs.other, ...(updates.needs?.other ?? {}) },
    } as Budget["needs"],
    wants: { ...existing.wants, ...(updates.wants ?? {}) },
    userId: existing.userId,
    budgetId: existing.budgetId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
    status: existing.status === "PENDING" ? "REVIEWED" : existing.status,
  };

  await db.send(new PutCommand({ TableName: BUDGETS_TABLE, Item: merged }));

  return merged;
}

export async function confirmBudget(
  userId: string,
  budgetId: string
): Promise<void> {
  const now = new Date().toISOString();

  await db.send(
    new UpdateCommand({
      TableName: BUDGETS_TABLE,
      Key: { userId, budgetId },
      UpdateExpression: "SET #s = :confirmed, updatedAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":confirmed": "CONFIRMED", ":now": now },
    })
  );

  await db.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { id: userId },
      UpdateExpression:
        "SET onboarding.budgetConfirmed = :t, updated_at = :now",
      ExpressionAttributeValues: { ":t": true, ":now": now },
    })
  );
}
