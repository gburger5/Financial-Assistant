import type { FastifyInstance } from "fastify";
import { verifyToken } from "../middleware/auth.js";
import {
  createLinkToken,
  exchangePublicToken,
  syncTransactions,
  syncInvestmentTransactions,
} from "../services/plaid.js";
import { analyzeAndPopulateBudget } from "../services/budget.js";
import { getUserById } from "../services/auth.js";
import { encryptToken, decryptToken } from "../lib/encryption.js";

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

  // Exchanges the public_token from Plaid Link, syncs transactions and investment
  // transactions from ALL linked banks, re-analyzes, and returns the populated budget.
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
        // Decrypt stored tokens so they can be used for Plaid API calls
        const rawExistingItems: typeof newItem[] = user?.plaidItems ?? [];
        const existingItems = rawExistingItems.map((item) => ({
          ...item,
          accessToken: decryptToken(item.accessToken),
        }));
        // De-duplicate: if this item was already linked (same itemId), replace the stored
        // entry with the fresh token rather than adding a second copy.
        const existingItemIds = new Set(rawExistingItems.map((i) => i.itemId));
        const allItems = existingItemIds.has(newItem.itemId)
          ? existingItems.map((i) => (i.itemId === newItem.itemId ? newItem : i))
          : [...existingItems, newItem];

        // Sync regular and investment transactions from every linked bank in parallel
        const [allTransactions, allInvestmentTransactions] = await Promise.all([
          Promise.all(allItems.map((item) => syncTransactions(item.accessToken))).then((r) => r.flat()),
          Promise.all(allItems.map((item) => syncInvestmentTransactions(item.accessToken))).then((r) => r.flat()),
        ]);

        // Encrypt the new item's access token before persisting
        const itemToStore = { ...newItem, accessToken: encryptToken(newItem.accessToken) };

        // Analyze the combined transaction set and persist the budget
        const budget = await analyzeAndPopulateBudget(
          userId,
          itemToStore,
          allTransactions,
          allInvestmentTransactions
        );

        return { budget, banksConnected: allItems.length };
      } catch (error) {
        req.log.error({ error }, "Failed to exchange token");
        return reply.status(500).send({ error: "Failed to link bank account" });
      }
    }
  );
}
