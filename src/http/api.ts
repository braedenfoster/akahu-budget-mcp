import { Router } from "express";
import { computeBillsView } from "../bills/view.js";
import { computeSpendingAllowance } from "../budget/allowance.js";
import { resolvePeriod } from "../budget/engine.js";
import { householdToday, type AppContext } from "../context.js";

/**
 * REST routes for the native app (ADR-0013). They have no auth of their own,
 * so mount them on the public listener behind the authenticate middleware only.
 */
export function buildApiRouter(ctx: AppContext): Router {
  const router = Router();
  // The Bills ride on this response so the phone keeps one fetch, one cache and one refresh worker.
  router.get("/spending-allowance", (_req, res) => {
    res.json({
      spending_allowance: computeSpendingAllowance(ctx, resolvePeriod(ctx)),
      bills: computeBillsView(ctx, householdToday(ctx)),
    });
  });
  return router;
}
