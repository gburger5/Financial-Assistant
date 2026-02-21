import { CountryCode, Products } from "plaid";
import { plaidClient } from "../lib/plaid.js";

// Number of days of transaction history to request on initial sync.
// Adjust this value to change the lookback window.
const DAYS_REQUESTED = 30;

export async function createLinkToken(userId: string): Promise<string> {
  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "Financial Assistant",
    products: [Products.Transactions],
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
