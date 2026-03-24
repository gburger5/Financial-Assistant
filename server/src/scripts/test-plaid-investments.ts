/**
 * @module test-plaid-investments
 * @description Standalone script to verify the custom_user_investments Plaid sandbox
 * user returns correct investment and transaction data. Compares transactionsSync
 * vs transactionsGet to check for discrepancies.
 *
 * Usage: cd server && npx tsx src/scripts/test-plaid-investments.ts
 */
import "dotenv/config";
import { plaidClient } from "../lib/plaidClient.js";
import { Products } from "plaid";

async function main() {
  console.log("Creating sandbox public token with custom_user_investments...\n");

  const createResponse = await plaidClient.sandboxPublicTokenCreate({
    institution_id: "ins_109508",
    initial_products: [Products.Investments, Products.Transactions],
    options: { override_username: "custom_user_investments" },
  });
  const publicToken = createResponse.data.public_token;
  console.log("Public token created:", publicToken);

  const exchangeResponse = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });
  const accessToken = exchangeResponse.data.access_token;
  console.log("Access token obtained:", accessToken.slice(0, 20) + "...\n");

  // Fetch accounts
  const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
  const accounts = accountsResponse.data.accounts;
  const accountNames = new Map(accounts.map((a) => [a.account_id, a.name]));

  console.log("=== ACCOUNTS (" + accounts.length + ") ===");
  for (const acct of accounts) {
    console.log(`  ${acct.name} (${acct.subtype}) — balance: $${acct.balances.current}`);
  }

  // Fetch holdings + securities
  const holdingsResponse = await plaidClient.investmentsHoldingsGet({ access_token: accessToken });
  const { holdings, securities } = holdingsResponse.data;
  const secMap = new Map(securities.map((s) => [s.security_id, s]));

  console.log("\n=== HOLDINGS (" + holdings.length + ") ===");
  for (const h of holdings) {
    const sec = secMap.get(h.security_id);
    const acctName = accountNames.get(h.account_id) ?? h.account_id;
    console.log(
      `  [${acctName}] ${sec?.ticker_symbol ?? "?"} — qty: ${h.quantity}, price: $${h.institution_price}, cost_basis: $${h.cost_basis}, value: $${h.institution_value}`
    );
  }

  // Fetch investment transactions
  const invTxResponse = await plaidClient.investmentsTransactionsGet({
    access_token: accessToken,
    start_date: "2025-01-01",
    end_date: "2026-12-31",
  });

  console.log("\n=== INVESTMENT TRANSACTIONS (" + invTxResponse.data.investment_transactions.length + ") ===");
  for (const tx of invTxResponse.data.investment_transactions.sort((a, b) => a.date.localeCompare(b.date))) {
    const acctName = accountNames.get(tx.account_id) ?? tx.account_id;
    const sec = tx.security_id ? secMap.get(tx.security_id) : null;
    console.log(
      `  ${tx.date}  ${tx.type.padEnd(5)}  ${tx.name}  qty: ${tx.quantity}  price: $${tx.price}  amt: $${tx.amount}  [${acctName}] ${sec?.ticker_symbol ?? ""}`
    );
  }

  // transactionsSync — compare with transactionsGet
  let cursor: string | undefined;
  let syncTxns: Array<{ date: string; name: string; amount: number; account_id: string }> = [];
  const MAX_POLLS = 5;

  for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
    let hasMore = true;
    while (hasMore) {
      const syncResponse = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor: cursor ?? "",
      });
      const { added, has_more, next_cursor } = syncResponse.data;
      syncTxns = syncTxns.concat(
        added.map((t) => ({ date: t.date, name: t.name, amount: t.amount, account_id: t.account_id }))
      );
      hasMore = has_more;
      cursor = next_cursor;
    }
    if (syncTxns.length > 0) break;
    console.log(`  Waiting for transactions (attempt ${attempt}/${MAX_POLLS})...`);
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\n=== TRANSACTIONS via sync (" + syncTxns.length + ") ===");
  for (const tx of syncTxns.sort((a, b) => a.date.localeCompare(b.date))) {
    const acctName = accountNames.get(tx.account_id) ?? tx.account_id;
    console.log(`  ${tx.date}  ${tx.amount > 0 ? "+" : ""}${tx.amount.toFixed(2)}  ${tx.name}  [${acctName}]`);
  }

  // transactionsGet
  const getResponse = await plaidClient.transactionsGet({
    access_token: accessToken,
    start_date: "2025-01-01",
    end_date: "2026-12-31",
  });
  const getTxns = getResponse.data.transactions;

  console.log("\n=== TRANSACTIONS via get (" + getTxns.length + ") ===");
  for (const tx of getTxns.sort((a, b) => a.date.localeCompare(b.date))) {
    const acctName = accountNames.get(tx.account_id) ?? tx.account_id;
    console.log(`  ${tx.date}  ${tx.amount > 0 ? "+" : ""}${tx.amount.toFixed(2)}  ${tx.name}  [${acctName}]`);
  }

  // Summary comparison
  console.log("\n=== SYNC vs GET COMPARISON ===");
  console.log(`  Sync: ${syncTxns.length} transactions`);
  console.log(`  Get:  ${getTxns.length} transactions`);
  console.log(`  Match: ${syncTxns.length === getTxns.length ? "YES" : "NO — counts differ"}`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Error:", err.response?.data ?? err.message);
  process.exit(1);
});
