import { Router } from "express";
import { computeSpendingAllowance, householdCurrentPeriod } from "../budget/allowance.js";
import type { AppContext } from "../context.js";

/**
 * Plain JSON for phone widgets. It has no auth, so mount it on the tailnet
 * listener only. Later widgets add sibling keys to the summary.
 */
export function buildWidgetRouter(ctx: AppContext): Router {
  const router = Router();
  router.get("/widget/summary", (_req, res) => {
    res.json({ spending_allowance: computeSpendingAllowance(ctx, householdCurrentPeriod(ctx)) });
  });
  return router;
}
