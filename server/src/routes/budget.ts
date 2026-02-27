import type { FastifyInstance } from "fastify";
import { verifyToken } from "../middleware/auth.js";
import {
  getBudget,
  updateBudget,
  confirmBudget,
  type Budget,
} from "../services/budget.js";

export default async function budgetRoutes(app: FastifyInstance) {
  // Returns the user's most recent budget
  app.get("/budget", { preHandler: verifyToken }, async (req, reply) => {
    const budget = await getBudget(req.user!.userId);

    if (!budget) {
      return reply.status(404).send({ error: "No budget found" });
    }

    return { budget };
  });

  // Merges partial updates into the budget and advances status to REVIEWED
  app.put<{ Params: { budgetId: string }; Body: Partial<Budget> }>(
    "/budget/:budgetId",
    { preHandler: verifyToken },
    async (req, reply) => {
      try {
        const budget = await updateBudget(
          req.user!.userId,
          req.params.budgetId,
          req.body
        );
        return { budget };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Update failed";
        return reply.status(400).send({ error: message });
      }
    }
  );

  // Locks the budget as CONFIRMED and sets onboarding.budgetConfirmed = true
  app.post<{ Params: { budgetId: string } }>(
    "/budget/:budgetId/confirm",
    { preHandler: verifyToken },
    async (req, reply) => {
      try {
        await confirmBudget(req.user!.userId, req.params.budgetId);
        return { confirmed: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Confirm failed";
        return reply.status(400).send({ error: message });
      }
    }
  );
}
