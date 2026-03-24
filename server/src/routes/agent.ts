import type { FastifyInstance, FastifyBaseLogger } from "fastify";
import { verifyJWT } from "../plugins/auth.plugin.js";
import { getLatestBudget } from "../modules/budget/budget.service.js";
import type { Budget } from "../modules/budget/budget.types.js";
import { db } from "../db/index.js";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import { findUserById } from "../modules/auth/auth.repository.js";
import { getLiabilitiesForUser } from "../modules/liabilities/liabilities.service.js";
import { getLatestHoldings } from "../modules/investments/investments.service.js";
import { getAccountsForUser } from "../modules/accounts/accounts.service.js";
import { upsertTransaction } from "../modules/transactions/transactions.repository.js";
import { adjustBalance } from "../modules/accounts/accounts.repository.js";
import type { Transaction } from "../modules/transactions/transactions.types.js";
import type {
  DebtAccount,
  DebtAgentInput,
  InvestmentAccount,
  InvestingAgentInput,
} from "../types.js";

const PROPOSALS_TABLE = "proposals";
const BUDGETS_TABLE = "Budgets";
const USERS_TABLE = "Users";
const AGENT_SERVICE_URL =
  process.env.AGENT_SERVICE_URL || "http://localhost:8001";

interface Proposal {
  proposalId: string;
  userId: string;
  type: string;
  status: string;
  summary: string;
  rationale: string;
  payload: Record<string, unknown>;
  budget: Budget;
  totalAllocation: string;
  scheduledPayments?: unknown[];
  scheduledContributions?: unknown[];
  createdAt: string;
  updatedAt: string;
}

// ---- Helpers ----

/**
 * Finds the user's primary checking account — the depository/checking account
 * with the highest current balance.  Returns undefined if none exists.
 *
 * Money sent to debt or investment accounts originates from checking, so the
 * caller must deduct the total from whichever checking account holds the most
 * funds.
 */
async function findPrimaryChecking(userId: string) {
  const accounts = await getAccountsForUser(userId);
  const checking = accounts.filter(
    (a) => a.type === 'depository' && a.subtype === 'checking'
  );
  if (checking.length === 0) return undefined;
  // Pick the account with the highest balance as the primary source.
  return checking.reduce((best, a) =>
    (a.currentBalance ?? 0) >= (best.currentBalance ?? 0) ? a : best
  );
}

/**
 * Converts the agent's nested budget structure (from budget_tools.py) into the
 * flat { category: { amount } } shape that the server's Budget type expects.
 *
 * Agent structure:
 *   income.monthlyNet, needs.housing.rentOrMortgage, needs.utilities.utilities,
 *   needs.transportation.{carPayment,gasFuel}, needs.other.{groceries,personalCare},
 *   wants.{takeout,shopping}, investments.monthlyContribution, debts.minimumPayments
 *
 * Server Budget structure:
 *   income.amount, housing.amount, utilities.amount, transportation.amount,
 *   groceries.amount, personalCare.amount, takeout.amount, shopping.amount,
 *   investments.amount, debts.amount
 */
function flattenAgentBudget(agentBudget: Budget): Omit<Budget, 'userId' | 'budgetId' | 'createdAt'> {
  const b = agentBudget as unknown as Record<string, Record<string, Record<string, number>>>;
  const num = (v: unknown): number => (v != null ? Number(v) : 0);

  return {
    income:         { amount: num(b.income?.monthlyNet) },
    housing:        { amount: num(b.needs?.housing?.rentOrMortgage) },
    utilities:      { amount: num(b.needs?.utilities?.utilities) },
    transportation: { amount: num(b.needs?.transportation?.carPayment) + num(b.needs?.transportation?.gasFuel) },
    groceries:      { amount: num(b.needs?.other?.groceries) },
    personalCare:   { amount: num(b.needs?.other?.personalCare) },
    takeout:        { amount: num(b.wants?.takeout) },
    shopping:       { amount: num(b.wants?.shopping) },
    emergencyFund:  { amount: num(b.emergencyFund?.monthlyContribution) },
    entertainment:  { amount: num(b.wants?.entertainment) },
    medical:        { amount: num(b.needs?.other?.medical) },
    investments:    { amount: num(b.investments?.monthlyContribution) },
    debts:          { amount: num(b.debts?.minimumPayments) },
    goals:          [],
  };
}

/**
 * Builds a DebtAccount array for the debt agent by reading liabilities and
 * account balances from DynamoDB — no live Plaid call needed since initial
 * sync has already stored this data.
 *
 * currentBalance is sourced from the Accounts table (joined on plaidAccountId)
 * because Plaid's liabilities endpoint does not return balances on liability
 * objects; they are stored separately during syncAccounts.
 */
async function triggerDebtAgent(
  userId: string,
  debtAllocation: number,
  _log: FastifyBaseLogger,
  rejectionReason?: string
): Promise<unknown> {
  const [liabilities, accounts] = await Promise.all([
    getLiabilitiesForUser(userId),
    getAccountsForUser(userId),
  ]);

  const accountMap = new Map(accounts.map((a) => [a.plaidAccountId, a]));
  const debts: DebtAccount[] = [];

  for (const liability of liabilities) {
    const account = accountMap.get(liability.plaidAccountId);

    if (liability.liabilityType === "credit") {
      debts.push({
        account_id: liability.plaidAccountId,
        name: account?.name ?? "Credit Card",
        institution_name: null,
        type: "credit_card",
        current_balance: account?.currentBalance ?? 0,
        // Use the purchase APR (first entry) as the representative rate
        interest_rate: liability.details.aprs[0]?.aprPercentage ?? null,
        minimum_payment: liability.details.minimumPaymentAmount,
        next_payment_due_date: liability.details.nextPaymentDueDate,
      });
    } else if (liability.liabilityType === "student") {
      debts.push({
        account_id: liability.plaidAccountId,
        name: account?.name ?? "Student Loan",
        institution_name: null,
        type: "student_loan",
        current_balance: account?.currentBalance ?? 0,
        interest_rate: liability.details.interestRatePercentage,
        minimum_payment: liability.details.minimumPaymentAmount,
        next_payment_due_date: null,
      });
    } else if (liability.liabilityType === "mortgage") {
      debts.push({
        account_id: liability.plaidAccountId,
        name: account?.name ?? "Mortgage",
        institution_name: null,
        type: "mortgage",
        current_balance: account?.currentBalance ?? 0,
        interest_rate: liability.details.interestRatePercentage,
        minimum_payment: liability.details.nextMonthlyPayment,
        next_payment_due_date: null,
      });
    }
  }

  const input: DebtAgentInput & { rejectionReason?: string } = {
    userId,
    debtAllocation,
    debts,
    ...(rejectionReason ? { rejectionReason } : {}),
  };

  const agentRes = await fetch(`${AGENT_SERVICE_URL}/agent/debt/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!agentRes.ok) {
    const body = await agentRes.text();
    throw new Error(`Debt agent returned ${agentRes.status}: ${body}`);
  }

  return agentRes.json();
}

/**
 * Builds an InvestmentAccount array for the investing agent by reading holdings
 * and account balances from DynamoDB — no live Plaid call needed since initial
 * sync has already stored this data.
 *
 * Holdings are grouped by plaidAccountId and joined with the Accounts table for
 * balance and subtype data. Only accounts of type 'investment' or accounts that
 * have at least one holding are included.
 */
async function triggerInvestingAgent(
  userId: string,
  investingAllocation: number,
  _log: FastifyBaseLogger,
  rejectionReason?: string
): Promise<unknown> {
  const [user, holdings, accountsList] = await Promise.all([
    findUserById(userId),
    getLatestHoldings(userId),
    getAccountsForUser(userId),
  ]);

  const dob = (user as unknown as Record<string, unknown>)?.dateOfBirth as string | undefined;
  const userAge: number | null = dob
    ? new Date().getFullYear() - new Date(dob).getFullYear()
    : null;

  // Index holdings by account for O(1) lookup when mapping accounts below
  const holdingsByAccount = new Map<string, typeof holdings>();
  for (const h of holdings) {
    const bucket = holdingsByAccount.get(h.plaidAccountId) ?? [];
    bucket.push(h);
    holdingsByAccount.set(h.plaidAccountId, bucket);
  }

  const accounts: InvestmentAccount[] = accountsList
    .filter((a) => a.type === "investment" || holdingsByAccount.has(a.plaidAccountId))
    .map((acct) => {
      const acctHoldings = (holdingsByAccount.get(acct.plaidAccountId) ?? []).map((h) => ({
        security_name: h.securityName ?? h.securityId,
        ticker_symbol: h.tickerSymbol,
        quantity: Number(h.quantity),
        current_value: Number(h.institutionValue),
      }));

      let acctType: InvestmentAccount["type"] = "other";
      const subtype = (acct.subtype ?? "").toLowerCase();
      if (subtype.includes("401k")) acctType = "401k";
      else if (subtype.includes("ira")) acctType = "ira";
      else if (subtype === "brokerage") acctType = "brokerage";

      return {
        account_id: acct.plaidAccountId,
        name: acct.name,
        institution_name: null,
        type: acctType,
        current_balance: acct.currentBalance ?? 0,
        holdings: acctHoldings,
      };
    });

  const input: InvestingAgentInput & { rejectionReason?: string } = {
    userId,
    investingAllocation,
    accounts,
    userAge,
    ...(rejectionReason ? { rejectionReason } : {}),
  };

  const agentRes = await fetch(`${AGENT_SERVICE_URL}/agent/investing/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!agentRes.ok) {
    const body = await agentRes.text();
    throw new Error(`Investing agent returned ${agentRes.status}: ${body}`);
  }

  return agentRes.json();
}

// ---- Transaction writers ----

/**
 * Maps an agent-generated debt payment to a Transaction record.
 * Amount is kept positive (Plaid convention: positive = money out).
 * Uses today's date as the approval date — guards against stale agent dates.
 *
 * @param {string} userId - UUID of the user who owns this transaction.
 * @param {Record<string, unknown>} rawTx - Scheduled payment from the approved proposal.
 * @returns {Transaction}
 */
function mapScheduledPayment(userId: string, rawTx: Record<string, unknown>): Transaction {
  const now = new Date().toISOString();
  const txId = `agent-debt-${ulid()}`;
  const date = now.slice(0, 10);

  return {
    userId,
    sortKey: `${date}#${txId}`,
    plaidTransactionId: txId,
    plaidAccountId: String(rawTx.plaid_account_id),
    amount: Number(rawTx.amount),
    date,
    name: String(rawTx.debt_name),
    merchantName: String(rawTx.debt_name),
    category: "LOAN_PAYMENTS",
    detailedCategory: "LOAN_PAYMENTS_DEBT_PAYMENT",
    categoryIconUrl: null,
    // User explicitly approved this transaction — mark as confirmed, not pending.
    // Plaid's pending=true means "unsettled at the bank"; that concept does not
    // apply to agent-generated records that the user has already accepted.
    pending: false,
    isoCurrencyCode: "USD",
    unofficialCurrencyCode: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Maps an agent-generated investment contribution to a Transaction record.
 * Amount is kept positive (Plaid convention: positive = money out / transfer out).
 * Uses today's date as the approval date — guards against stale agent dates.
 *
 * @param {string} userId - UUID of the user who owns this transaction.
 * @param {Record<string, unknown>} rawTx - Scheduled contribution from the approved proposal.
 * @returns {Transaction}
 */
function mapScheduledContribution(userId: string, rawTx: Record<string, unknown>): Transaction {
  const now = new Date().toISOString();
  const txId = `agent-invest-${ulid()}`;
  // Include fund name in description when available so the user knows exactly
  // where the contribution is going (e.g. "Roth IRA: Schwab Total Stock Market")
  const name = rawTx.fund_name
    ? `${rawTx.account_name}: ${rawTx.fund_name}`
    : String(rawTx.account_name);

  const date = now.slice(0, 10);

  return {
    userId,
    sortKey: `${date}#${txId}`,
    plaidTransactionId: txId,
    plaidAccountId: String(rawTx.plaid_account_id),
    amount: Number(rawTx.amount),
    date,
    name,
    merchantName: String(rawTx.account_name),
    category: "TRANSFER_OUT",
    detailedCategory: "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
    categoryIconUrl: null,
    // User explicitly approved this transaction — mark as confirmed, not pending.
    pending: false,
    isoCurrencyCode: "USD",
    unofficialCurrencyCode: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Writes agent-generated transactions to the Transactions table so they appear
 * in the user's transaction feed immediately after proposal approval.
 * Failures are logged individually and do not abort the batch — a partial write
 * is acceptable since the proposal is already marked executed.
 *
 * @param {string} userId - UUID of the user who owns these transactions.
 * @param {unknown[]} rawTxns - Raw scheduledPayments or scheduledContributions from the proposal.
 * @param {"debt" | "investing"} type - Determines which mapping function to apply.
 * @param {FastifyBaseLogger} log - Logger for per-item failure tracking.
 */
async function writeProposalTransactions(
  userId: string,
  rawTxns: unknown[],
  type: "debt" | "investing",
  log: FastifyBaseLogger,
): Promise<void> {
  await Promise.allSettled(
    rawTxns.map(async (raw) => {
      try {
        const tx =
          type === "debt"
            ? mapScheduledPayment(userId, raw as Record<string, unknown>)
            : mapScheduledContribution(userId, raw as Record<string, unknown>);
        await upsertTransaction(tx);
      } catch (err) {
        log.error({ err, raw }, "[writeProposalTransactions] failed to write transaction");
      }
    }),
  );
}

// ---- Routes ----

export default async function agentRoutes(app: FastifyInstance) {
  // POST /agent/budget — invoke Budget Agent with the user's current Plaid-synced budget
  app.post(
    "/budget",
    { preHandler: verifyJWT },
    async (req, reply) => {
      const userId = req.user!.userId;

      const budget = await getLatestBudget(userId);
      if (!budget) {
        return reply
          .status(404)
          .send({ error: "No budget found. Complete Plaid sync first." });
      }

      let agentRes: Response;
      try {
        agentRes = await fetch(`${AGENT_SERVICE_URL}/agent/budget`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, budget }),
        });
      } catch (err) {
        req.log.error({ err }, "Agent service unreachable");
        return reply.status(502).send({ error: "Agent service unreachable" });
      }

      if (!agentRes.ok) {
        const body = await agentRes.text();
        req.log.error({ body }, "Agent service returned error");
        return reply.status(502).send({ error: "Agent service error" });
      }

      const proposal = (await agentRes.json()) as Proposal;
      return { proposal };
    }
  );

  // POST /agent/budget/:proposalId/respond — approve or reject a budget proposal
  app.post<{
    Params: { proposalId: string };
    Body: { approved: boolean; rejectionReason?: string };
  }>(
    "/budget/:proposalId/respond",
    { preHandler: verifyJWT },
    async (req, reply) => {
      const userId = req.user!.userId;
      const { proposalId } = req.params;
      const { approved, rejectionReason } = req.body;
      const now = new Date().toISOString();

      // Verify proposal exists and belongs to this user
      const existing = await db.send(
        new GetCommand({ TableName: PROPOSALS_TABLE, Key: { proposalId } })
      );
      const proposal = existing.Item as Proposal | undefined;
      if (!proposal || proposal.userId !== userId) {
        return reply.status(404).send({ error: "Proposal not found" });
      }

      if (approved) {
        // Mark proposal as executed
        await db.send(
          new UpdateCommand({
            TableName: PROPOSALS_TABLE,
            Key: { proposalId },
            UpdateExpression: "SET #s = :executed, updatedAt = :now",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":executed": "executed",
              ":now": now,
            },
          })
        );

        // Write the agent-recommended budget into the Budgets table as a confirmed record.
        // flattenAgentBudget converts the agent's nested structure to the flat
        // { category: { amount } } shape the server's Budget type expects.
        await db.send(
          new PutCommand({
            TableName: BUDGETS_TABLE,
            Item: {
              ...flattenAgentBudget(proposal.budget),
              userId,
              budgetId: `budget#${ulid()}`,
              createdAt: now,
            },
          })
        );

        // Flag onboarding complete on the user record
        await db.send(
          new UpdateCommand({
            TableName: USERS_TABLE,
            Key: { id: userId },
            UpdateExpression:
              "SET onboarding.agentBudgetApproved = :t, updated_at = :now",
            ExpressionAttributeValues: { ":t": true, ":now": now },
          })
        );

        // Fire-and-forget: trigger debt and investing agents in parallel
        const debtAllocation = Number(
          (proposal.payload?.debtAllocation as string | undefined) ?? 0
        );
        const investingAllocation = Number(
          (proposal.payload?.investingAllocation as string | undefined) ?? 0
        );

        triggerDebtAgent(userId, debtAllocation, req.log).catch((err) =>
          req.log.error({ err }, "[triggerDebtAgent] failed")
        );
        triggerInvestingAgent(
          userId,
          investingAllocation,
          req.log
        ).catch((err) =>
          req.log.error({ err }, "[triggerInvestingAgent] failed")
        );

        return { success: true };
      } else {
        // Mark old proposal as rejected
        await db.send(
          new UpdateCommand({
            TableName: PROPOSALS_TABLE,
            Key: { proposalId },
            UpdateExpression:
              "SET #s = :rejected, rejectionReason = :reason, updatedAt = :now",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":rejected": "rejected",
              ":reason": rejectionReason ?? "",
              ":now": now,
            },
          })
        );

        // Re-fetch the user's current budget to pass to the agent
        const budget = await getLatestBudget(userId);

        let agentRes: Response;
        try {
          agentRes = await fetch(`${AGENT_SERVICE_URL}/agent/budget/revise`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              proposalId,
              budget,
              rejectionReason: rejectionReason ?? "",
            }),
          });
        } catch (err) {
          req.log.error({ err }, "Agent service unreachable on revision");
          return reply.status(502).send({ error: "Agent service unreachable" });
        }

        if (!agentRes.ok) {
          const body = await agentRes.text();
          req.log.error({ body }, "Agent service error on revision");
          return reply.status(502).send({ error: "Agent service error" });
        }

        const newProposal = (await agentRes.json()) as Proposal;
        return { proposal: newProposal };
      }
    }
  );

  // POST /agent/debt/:proposalId/respond — approve or reject a debt proposal
  app.post<{
    Params: { proposalId: string };
    Body: { approved: boolean; rejectionReason?: string };
  }>(
    "/debt/:proposalId/respond",
    { preHandler: verifyJWT },
    async (req, reply) => {
      const userId = req.user!.userId;
      const { proposalId } = req.params;
      const { approved, rejectionReason } = req.body;
      const now = new Date().toISOString();

      const existing = await db.send(
        new GetCommand({ TableName: PROPOSALS_TABLE, Key: { proposalId } })
      );
      const proposal = existing.Item as Proposal | undefined;
      if (!proposal || proposal.userId !== userId) {
        return reply.status(404).send({ error: "Proposal not found" });
      }

      if (approved) {
        await db.send(
          new UpdateCommand({
            TableName: PROPOSALS_TABLE,
            Key: { proposalId },
            UpdateExpression: "SET #s = :executed, updatedAt = :now",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":executed": "executed",
              ":now": now,
            },
          })
        );

        const payments = proposal.scheduledPayments ?? [];

        // Write to our Transactions table so the payment appears in the feed
        // on the correct debt account with LOAN_PAYMENTS category.
        // Agent-generated IDs (agent-debt-*) are never returned by Plaid sync,
        // so these records persist without being overwritten.
        await writeProposalTransactions(userId, payments, "debt", req.log);

        // Paying off debt reduces what you owe — balance goes down.
        for (const payment of payments) {
          const p = payment as Record<string, unknown>;
          await adjustBalance(userId, String(p.plaid_account_id), -Number(p.amount));
        }

        // Money leaves checking to fund debt payments — deduct the total.
        const debtTotal = payments.reduce<number>(
          (sum, p) => sum + Number((p as Record<string, unknown>).amount),
          0
        );
        const checkingForDebt = await findPrimaryChecking(userId);
        if (checkingForDebt && debtTotal > 0) {
          await adjustBalance(userId, checkingForDebt.plaidAccountId, -debtTotal);
        }

        return { success: true };
      } else {
        await db.send(
          new UpdateCommand({
            TableName: PROPOSALS_TABLE,
            Key: { proposalId },
            UpdateExpression:
              "SET #s = :rejected, rejectionReason = :reason, updatedAt = :now",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":rejected": "rejected",
              ":reason": rejectionReason ?? "",
              ":now": now,
            },
          })
        );

        const debtAllocation = Number(
          (proposal.payload?.totalAllocation as string | undefined) ?? 0
        );

        let newProposal: unknown;
        try {
          newProposal = await triggerDebtAgent(
            userId,
            debtAllocation,
            req.log,
            rejectionReason
          );
        } catch (err) {
          req.log.error({ err }, "Debt agent failed on revision");
          return reply
            .status(502)
            .send({ error: "Agent service error on revision" });
        }

        return { proposal: newProposal };
      }
    }
  );

  // POST /agent/investing/:proposalId/respond — approve or reject an investing proposal
  app.post<{
    Params: { proposalId: string };
    Body: { approved: boolean; rejectionReason?: string };
  }>(
    "/investing/:proposalId/respond",
    { preHandler: verifyJWT },
    async (req, reply) => {
      const userId = req.user!.userId;
      const { proposalId } = req.params;
      const { approved, rejectionReason } = req.body;
      const now = new Date().toISOString();

      const existing = await db.send(
        new GetCommand({ TableName: PROPOSALS_TABLE, Key: { proposalId } })
      );
      const proposal = existing.Item as Proposal | undefined;
      if (!proposal || proposal.userId !== userId) {
        return reply.status(404).send({ error: "Proposal not found" });
      }

      if (approved) {
        await db.send(
          new UpdateCommand({
            TableName: PROPOSALS_TABLE,
            Key: { proposalId },
            UpdateExpression: "SET #s = :executed, updatedAt = :now",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":executed": "executed",
              ":now": now,
            },
          })
        );

        const contributions = proposal.scheduledContributions ?? [];

        // Write to our Transactions table so the contribution appears in the feed
        // on the correct investment account with TRANSFER_OUT category.
        // Agent-generated IDs (agent-invest-*) are never returned by Plaid sync,
        // so these records persist without being overwritten.
        await writeProposalTransactions(userId, contributions, "investing", req.log);

        // Contributions increase the investment account balance.
        for (const contrib of contributions) {
          const c = contrib as Record<string, unknown>;
          await adjustBalance(userId, String(c.plaid_account_id), Number(c.amount));
        }

        // Money leaves checking to fund investment contributions — deduct the total.
        const investTotal = contributions.reduce<number>(
          (sum, c) => sum + Number((c as Record<string, unknown>).amount),
          0
        );
        const checkingForInvest = await findPrimaryChecking(userId);
        if (checkingForInvest && investTotal > 0) {
          await adjustBalance(userId, checkingForInvest.plaidAccountId, -investTotal);
        }

        return { success: true };
      } else {
        await db.send(
          new UpdateCommand({
            TableName: PROPOSALS_TABLE,
            Key: { proposalId },
            UpdateExpression:
              "SET #s = :rejected, rejectionReason = :reason, updatedAt = :now",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":rejected": "rejected",
              ":reason": rejectionReason ?? "",
              ":now": now,
            },
          })
        );

        const investingAllocation = Number(
          (proposal.payload?.totalAllocation as string | undefined) ?? 0
        );

        let newProposal: unknown;
        try {
          newProposal = await triggerInvestingAgent(
            userId,
            investingAllocation,
            req.log,
            rejectionReason
          );
        } catch (err) {
          req.log.error({ err }, "Investing agent failed on revision");
          return reply
            .status(502)
            .send({ error: "Agent service error on revision" });
        }

        return { proposal: newProposal };
      }
    }
  );

  // GET /proposals — list proposals for the authenticated user
  app.get<{
    Querystring: { type?: string; status?: string };
  }>(
    "/proposals",
    { preHandler: verifyJWT },
    async (req) => {
      const userId = req.user!.userId;
      const { type, status } = req.query;

      let filterExpr = "userId = :uid";
      const exprValues: Record<string, unknown> = { ":uid": userId };

      if (type) {
        filterExpr += " AND #t = :type";
        exprValues[":type"] = type;
      }
      if (status) {
        filterExpr += " AND #s = :status";
        exprValues[":status"] = status;
      }

      const exprNames: Record<string, string> = {};
      if (type) exprNames["#t"] = "type";
      if (status) exprNames["#s"] = "status";

      const result = await db.send(
        new ScanCommand({
          TableName: PROPOSALS_TABLE,
          FilterExpression: filterExpr,
          ExpressionAttributeValues: exprValues,
          ...(Object.keys(exprNames).length > 0
            ? { ExpressionAttributeNames: exprNames }
            : {}),
        })
      );

      const items = (result.Items ?? []).sort(
        (a, b) =>
          new Date(b.createdAt as string).getTime() -
          new Date(a.createdAt as string).getTime()
      );

      return { proposals: items };
    }
  );

  // DELETE /proposals/:proposalId — permanently remove a proposal
  app.delete<{ Params: { proposalId: string } }>(
    "/proposals/:proposalId",
    { preHandler: verifyJWT },
    async (req, reply) => {
      const userId = req.user!.userId;
      const { proposalId } = req.params;

      // Verify ownership before deleting — return 404 instead of 403
      // to avoid revealing whether the proposal exists for another user.
      const existing = await db.send(
        new GetCommand({ TableName: PROPOSALS_TABLE, Key: { proposalId } })
      );
      const proposal = existing.Item as Proposal | undefined;
      if (!proposal || proposal.userId !== userId) {
        return reply.status(404).send({ error: "Proposal not found" });
      }

      await db.send(
        new DeleteCommand({ TableName: PROPOSALS_TABLE, Key: { proposalId } })
      );

      return reply.status(204).send();
    }
  );
}
