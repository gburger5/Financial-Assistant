import type { FastifyInstance } from "fastify";
import { verifyToken } from "../middleware/auth.js";
import {
  createLinkToken,
  exchangePublicToken,
  syncTransactions,
} from "../services/plaid.js";
import { analyzeAndPopulateBudget } from "../services/budget.js";
import { getUserById } from "../services/auth.js";

export default async function plaidRoutes(app: FastifyInstance) {
  // Returns a short-lived link_token used to initialize Plaid Link on the frontend
  app.post(
    "/plaid/create-link-token",
    { preHandler: verifyToken },
    async (req, reply) => {
      try {
        const linkToken = await createLinkToken(req.user!.userId);
        return { link_token: linkToken };
      } catch (error) {
        req.log.error({ error }, "Failed to create link token");
        return reply.status(500).send({ error: "Failed to create link token" });
      }
    }
  );

  // Exchanges the public_token from Plaid Link, syncs transactions from ALL linked
  // banks, re-analyzes, and returns the populated budget + total banks connected.
  app.post<{ Body: { public_token: string } }>(
    "/plaid/exchange-token",
    { preHandler: verifyToken },
    async (req, reply) => {
      const { public_token } = req.body;

      if (!public_token) {
        return reply.status(400).send({ error: "public_token is required" });
      }

      try {
        const userId = req.user!.userId;

        // Exchange the new public token
        const { accessToken, itemId } = await exchangePublicToken(public_token);
        const newItem = { accessToken, itemId, linkedAt: new Date().toISOString() };

        // Get existing linked banks so we can sync all of them
        const user = await getUserById(userId);
        const existingItems: typeof newItem[] = user?.plaidItems ?? [];
        const allItems = [...existingItems, newItem];

        // Sync settled transactions from every linked bank and combine
        const allTransactions = (
          await Promise.all(allItems.map((item) => syncTransactions(item.accessToken)))
        ).flat();

        // Analyze the combined transaction set and persist the budget
        const budget = await analyzeAndPopulateBudget(userId, newItem, allTransactions);

        return { budget, banksConnected: allItems.length };
      } catch (error) {
        req.log.error({ error }, "Failed to exchange token");
        return reply.status(500).send({ error: "Failed to link bank account" });
      }
    }
  );
}
