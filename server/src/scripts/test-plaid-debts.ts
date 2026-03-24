/**
 * @module test-plaid-debts
 * @description Standalone script to verify the custom_user_debts Plaid sandbox
 * user returns correct liability data. Creates a sandbox token with override
 * accounts, exchanges it, and fetches liabilities — no server or DB needed.
 *
 * Usage: cd server && npx tsx src/scripts/test-plaid-debts.ts
 */
import "dotenv/config";
import { plaidClient } from "../lib/plaidClient.js";
import { Products } from "plaid";


async function main() {
  console.log("Creating sandbox public token with custom_user_debts...\n");

  const createResponse = await plaidClient.sandboxPublicTokenCreate({
    institution_id: "ins_109508",
    initial_products: [Products.Liabilities, Products.Transactions],
    options: { override_username: "custom_user_debts" },
  });
  const publicToken = createResponse.data.public_token;
  console.log("Public token created:", publicToken);

  const exchangeResponse = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });
  const accessToken = exchangeResponse.data.access_token;
  console.log("Access token obtained:", accessToken.slice(0, 20) + "...\n");

  const liabilitiesResponse = await plaidClient.liabilitiesGet({
    access_token: accessToken,
  });

  const { accounts, liabilities } = liabilitiesResponse.data;

  console.log("=== ACCOUNTS (" + accounts.length + ") ===");
  for (const acct of accounts) {
    console.log(
      `  ${acct.name} (${acct.subtype}) — balance: $${acct.balances.current}, limit: $${acct.balances.limit ?? "N/A"}`
    );
  }

  console.log("\n=== CREDIT LIABILITIES (" + (liabilities.credit?.length ?? 0) + ") ===");
  for (const credit of liabilities.credit ?? []) {
    console.log(`  Account: ${credit.account_id}`);
    console.log(`    Min payment: $${credit.minimum_payment_amount}`);
    console.log(`    Last payment: $${credit.last_payment_amount}`);
    console.log(`    Last statement balance: $${credit.last_statement_balance}`);
    console.log(`    APRs:`, credit.aprs?.map((a) => `${a.apr_type}: ${a.apr_percentage}%`).join(", "));
  }

  console.log("\n=== STUDENT LIABILITIES (" + (liabilities.student?.length ?? 0) + ") ===");
  for (const student of liabilities.student ?? []) {
    console.log(`  Account: ${student.account_id}`);
    console.log(`    Outstanding principal: $${student.outstanding_interest_amount}`);
    console.log(`    Interest rate: ${student.interest_rate_percentage}%`);
    console.log(`    Min payment: $${student.minimum_payment_amount}`);
    console.log(`    Origination principal: $${student.origination_principal_amount}`);
    console.log(`    Repayment plan: ${student.repayment_plan?.type}`);
  }

  console.log("\n=== MORTGAGE LIABILITIES (" + (liabilities.mortgage?.length ?? 0) + ") ===");
  if (!liabilities.mortgage?.length) {
    console.log("  (none — expected for this user)");
  }

  // Fetch transactions via sync — sandbox may need a few seconds to populate
  let cursor: string | undefined;
  let allTransactions: Array<{ date: string; name: string; amount: number; account_id: string }> = [];
  const MAX_POLLS = 5;

  for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
    let hasMore = true;
    while (hasMore) {
      const syncResponse = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor: cursor ?? "",
      });
      const { added, has_more, next_cursor } = syncResponse.data;
      allTransactions = allTransactions.concat(
        added.map((t) => ({ date: t.date, name: t.name, amount: t.amount, account_id: t.account_id }))
      );
      hasMore = has_more;
      cursor = next_cursor;
    }
    if (allTransactions.length > 0) break;
    console.log(`  Waiting for transactions (attempt ${attempt}/${MAX_POLLS})...`);
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Build account ID → name map for readable output
  const accountNames = new Map(accounts.map((a) => [a.account_id, a.name]));

  console.log("\n=== TRANSACTIONS via sync (" + allTransactions.length + ") ===");
  for (const tx of allTransactions.sort((a, b) => a.date.localeCompare(b.date))) {
    const acctName = accountNames.get(tx.account_id) ?? tx.account_id;
    console.log(`  ${tx.date}  ${tx.amount > 0 ? "+" : ""}${tx.amount.toFixed(2)}  ${tx.name}  [${acctName}]`);
  }

  // Also try transactionsGet — sandbox override transactions may only appear here
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

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Error:", err.response?.data ?? err.message);
  process.exit(1);
});
