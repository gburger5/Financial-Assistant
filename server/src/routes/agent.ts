import type { FastifyInstance, FastifyBaseLogger } from "fastify";
import { verifyToken } from "../middleware/auth.js";
import { getBudget, type Budget } from "../services/budget.js";
import { db } from "../lib/db.js";
import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import { plaidClient } from "../lib/plaid.js";
import { decryptToken } from "../lib/encryption.js";
import { getUserById } from "../services/auth.js";
import type {
  DebtAccount,
  DebtAgentInput,
  InvestmentAccount,
  InvestingAgentInput,
} from "../types.js";

const PROPOSALS_TABLE = "proposals";
const BUDGETS_TABLE = "Budgets";
const USERS_TABLE = "users";
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
  plaidTransactions?: unknown[];
  createdAt: string;
  updatedAt: string;
}

// ---- Helpers ----

async function getLatestAccessToken(userId: string): Promise<string | null> {
  const user = await getUserById(userId);
  const items: Array<{ accessToken: string; linkedAt: string }> =
    user?.plaidItems ?? [];
  if (items.length === 0) return null;
  const sorted = [...items].sort(
    (a, b) =>
      new Date(b.linkedAt).getTime() - new Date(a.linkedAt).getTime()
  );
  return decryptToken(sorted[0].accessToken);
}

async function triggerDebtAgent(
  userId: string,
  debtAllocation: number,
  log: FastifyBaseLogger,
  rejectionReason?: string
): Promise<unknown> {
  const accessToken = await getLatestAccessToken(userId);

  const debts: DebtAccount[] = [];
  if (accessToken) {
    try {
      const response = await plaidClient.liabilitiesGet({
        access_token: accessToken,
      });
      const { liabilities, accounts } = response.data;
      const accountMap = new Map(accounts.map((a) => [a.account_id, a]));

      for (const card of liabilities.credit ?? []) {
        if (!card.account_id) continue;
        const account = accountMap.get(card.account_id);
        debts.push({
          account_id: card.account_id,
          name: account?.name ?? "Credit Card",
          institution_name: null,
          type: "credit_card",
          current_balance: account?.balances.current ?? 0,
          interest_rate: card.aprs?.[0]?.apr_percentage ?? null,
          minimum_payment: card.minimum_payment_amount ?? null,
          next_payment_due_date: card.next_payment_due_date ?? null,
        });
      }

      for (const loan of liabilities.student ?? []) {
        if (!loan.account_id) continue;
        const account = accountMap.get(loan.account_id);
        debts.push({
          account_id: loan.account_id,
          name: account?.name ?? "Student Loan",
          institution_name: null,
          type: "student_loan",
          current_balance: account?.balances.current ?? 0,
          interest_rate: loan.interest_rate_percentage ?? null,
          minimum_payment: loan.minimum_payment_amount ?? null,
          next_payment_due_date: loan.next_payment_due_date ?? null,
        });
      }

      for (const mort of liabilities.mortgage ?? []) {
        const account = accountMap.get(mort.account_id);
        debts.push({
          account_id: mort.account_id,
          name: account?.name ?? "Mortgage",
          institution_name: null,
          type: "mortgage",
          current_balance: account?.balances.current ?? 0,
          interest_rate: mort.interest_rate?.percentage ?? null,
          minimum_payment: mort.next_monthly_payment ?? null,
          next_payment_due_date: mort.next_payment_due_date ?? null,
        });
      }
    } catch (e: unknown) {
      const code = (
        e as { response?: { data?: { error_code?: string } } }
      )?.response?.data?.error_code;
      if (
        code !== "PRODUCTS_NOT_SUPPORTED" &&
        code !== "NO_LIABILITY_ACCOUNTS"
      ) {
        log.warn({ err: e }, "[triggerDebtAgent] liabilitiesGet failed");
      }
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

async function triggerInvestingAgent(
  userId: string,
  investingAllocation: number,
  log: FastifyBaseLogger,
  rejectionReason?: string
): Promise<unknown> {
  const [user, accessToken] = await Promise.all([
    getUserById(userId),
    getLatestAccessToken(userId),
  ]);

  const dob = user?.dateOfBirth as string | undefined;
  const userAge: number | null = dob
    ? new Date().getFullYear() - new Date(dob).getFullYear()
    : null;

  const accounts: InvestmentAccount[] = [];
  if (accessToken) {
    try {
      const response = await plaidClient.investmentsHoldingsGet({
        access_token: accessToken,
      });
      const { accounts: plaidAccounts, holdings, securities } = response.data;
      const securityMap = new Map(securities.map((s) => [s.security_id, s]));

      for (const acct of plaidAccounts) {
        const acctHoldings = holdings
          .filter((h) => h.account_id === acct.account_id)
          .map((h) => {
            const sec = securityMap.get(h.security_id);
            return {
              security_name: sec?.name ?? h.security_id,
              ticker_symbol: sec?.ticker_symbol ?? null,
              quantity: h.quantity,
              current_value: h.institution_value,
            };
          });

        let acctType: InvestmentAccount["type"] = "other";
        const subtype = acct.subtype?.toLowerCase() ?? "";
        if (subtype.includes("401k")) acctType = "401k";
        else if (subtype.includes("ira")) acctType = "ira";
        else if (subtype === "brokerage") acctType = "brokerage";

        accounts.push({
          account_id: acct.account_id,
          name: acct.name,
          institution_name: null,
          type: acctType,
          current_balance: acct.balances.current ?? 0,
          holdings: acctHoldings,
        });
      }
    } catch (e: unknown) {
      const code = (
        e as { response?: { data?: { error_code?: string } } }
      )?.response?.data?.error_code;
      if (
        code !== "PRODUCTS_NOT_SUPPORTED" &&
        code !== "NO_INVESTMENT_ACCOUNTS"
      ) {
        log.warn(
          { err: e },
          "[triggerInvestingAgent] investmentsHoldingsGet failed"
        );
      }
    }
  }

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

// ---- Routes ----

export default async function agentRoutes(app: FastifyInstance) {
  // POST /agent/budget — invoke Budget Agent with the user's current Plaid-synced budget
  app.post(
    "/agent/budget",
    { preHandler: verifyToken },
    async (req, reply) => {
      const userId = req.user!.userId;

      const budget = await getBudget(userId);
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
    "/agent/budget/:proposalId/respond",
    { preHandler: verifyToken },
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
        await db.send(
          new PutCommand({
            TableName: BUDGETS_TABLE,
            Item: {
              ...proposal.budget,
              userId,
              budgetId: `budget#${ulid()}`,
              status: "CONFIRMED",
              createdAt: now,
              updatedAt: now,
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
        const budget = await getBudget(userId);

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
    "/agent/debt/:proposalId/respond",
    { preHandler: verifyToken },
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
            UpdateExpression:
              "SET #s = :executed, pendingTransactions = :txns, txnStatus = :queued, updatedAt = :now",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":executed": "executed",
              ":txns": proposal.plaidTransactions ?? [],
              ":queued": "queued",
              ":now": now,
            },
          })
        );
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
    "/agent/investing/:proposalId/respond",
    { preHandler: verifyToken },
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
            UpdateExpression:
              "SET #s = :executed, pendingTransactions = :txns, txnStatus = :queued, updatedAt = :now",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":executed": "executed",
              ":txns": proposal.plaidTransactions ?? [],
              ":queued": "queued",
              ":now": now,
            },
          })
        );
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
    { preHandler: verifyToken },
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
}
