import { CountryCode, Products } from "plaid";
import { plaidClient } from "../lib/plaid.js";

// Number of days of transaction/investment history to request on initial sync.
// Adjust this value to change the lookback window.
const DAYS_REQUESTED = 60;

export async function createLinkToken(userId: string): Promise<string> {
  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "Financial Assistant",
    products: [Products.Transactions],
    optional_products: [Products.Investments, Products.Liabilities],
    country_codes: [CountryCode.Us],
    language: "en",
  });

  return response.data.link_token;
}

export async function exchangePublicToken(
  publicToken: string
): Promise<{ accessToken: string; itemId: string }> {
  const response = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });

  return {
    accessToken: response.data.access_token,
    itemId: response.data.item_id,
  };
}

export interface PlaidTransaction {
  transaction_id: string;
  amount: number;
  date: string;
  merchant_name: string;
  personal_finance_category?: {
    primary: string;
    detailed: string;
  } | null;
}

export async function syncTransactions(
  accessToken: string
): Promise<PlaidTransaction[]> {
  const allTransactions: PlaidTransaction[] = [];
  let cursor: string | undefined = undefined;

  let hasMore = true;
  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor,
      count: 500,
      options: {
        days_requested: DAYS_REQUESTED,
        include_personal_finance_category: true,
      },
    });

    const { added, has_more, next_cursor } = response.data;

    for (const tx of added) {
      if (tx.pending) continue;
      allTransactions.push({
        transaction_id: tx.transaction_id,
        amount: tx.amount,
        date: tx.date,
        merchant_name: tx.merchant_name ?? tx.original_description ?? "",
        personal_finance_category: tx.personal_finance_category ?? null,
      });
    }

    cursor = next_cursor;
    hasMore = has_more;
  }

  return allTransactions;
}

export interface InvestmentTransaction {
  investment_transaction_id: string;
  // Plaid convention: negative = inflow (money entering account, e.g. contribution),
  // positive = outflow (money leaving account, e.g. securities purchase/fee).
  amount: number;
  date: string;
  type: string;     // "buy" | "sell" | "cash" | "fee" | "transfer"
  subtype: string;  // "contribution" | "deposit" | "withdrawal" | "buy" | "dividend" | ...
  name: string;
}

export async function syncInvestmentTransactions(
  accessToken: string
): Promise<InvestmentTransaction[]> {
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - DAYS_REQUESTED * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  try {
    const response = await plaidClient.investmentsTransactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
    });

    // Deduplicate by (date, type, subtype, name, amount).
    // Plaid sandbox — and some real institutions — can return identical transactions
    // across multiple investment accounts within the same item (e.g. a 401k and
    // an IRA that share the same synthetic data). Without deduplication every
    // contribution would be double-counted.
    const seen = new Set<string>();
    const unique = response.data.investment_transactions.filter((tx) => {
      const key = `${tx.date}|${tx.type}|${tx.subtype}|${tx.name}|${Math.round(tx.amount * 100)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique.map((tx) => ({
      investment_transaction_id: tx.investment_transaction_id,
      amount: tx.amount,
      date: tx.date,
      type: tx.type,
      subtype: tx.subtype,
      name: tx.name,
    }));
  } catch (e: unknown) {
    // Gracefully handle accounts that don't have the investments product enabled
    const code = (e as { response?: { data?: { error_code?: string } } })
      ?.response?.data?.error_code;
    if (code === "PRODUCTS_NOT_SUPPORTED" || code === "NO_INVESTMENT_ACCOUNTS") {
      console.warn("[syncInvestmentTransactions] investments not available for this item:", code);
      return [];
    }
    // Log unexpected errors so we can diagnose silently-swallowed failures
    console.warn("[syncInvestmentTransactions] unhandled error", {
      error_code: code,
      message: (e as Error)?.message,
    });
    throw e;
  }
}

// Returns the total minimum monthly debt payments across all liability accounts
// (student loans, credit cards, mortgages) for an Item.
export async function syncLiabilities(accessToken: string): Promise<number> {
  try {
    const response = await plaidClient.liabilitiesGet({
      access_token: accessToken,
    });

    const { student, credit, mortgage } = response.data.liabilities;
    let total = 0;

    for (const loan of student ?? []) {
      if (loan.minimum_payment_amount != null && loan.minimum_payment_amount > 0) {
        total += loan.minimum_payment_amount;
      }
    }

    for (const card of credit ?? []) {
      if (card.minimum_payment_amount != null && card.minimum_payment_amount > 0) {
        total += card.minimum_payment_amount;
      }
    }

    for (const mort of mortgage ?? []) {
      if (mort.next_monthly_payment != null && mort.next_monthly_payment > 0) {
        total += mort.next_monthly_payment;
      }
    }

    return Math.round(total * 100) / 100;
  } catch (e: unknown) {
    const code = (e as { response?: { data?: { error_code?: string } } })
      ?.response?.data?.error_code;
    if (code === "PRODUCTS_NOT_SUPPORTED" || code === "NO_LIABILITY_ACCOUNTS") {
      console.warn("[syncLiabilities] liabilities not available for this item:", code);
      return 0;
    }
    console.warn("[syncLiabilities] unhandled error", {
      error_code: code,
      message: (e as Error)?.message,
    });
    throw e;
  }
}
