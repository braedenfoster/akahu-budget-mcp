import { Router } from "express";
import { computeSpendingAllowance } from "../budget/allowance.js";
import { resolvePeriod } from "../budget/engine.js";
import type { AppContext } from "../context.js";

/**
 * Plain JSON for phone widgets. It has no auth, so mount it on the tailnet
 * listener only. Later widgets add sibling keys to the summary.
 */
export function buildWidgetRouter(ctx: AppContext): Router {
  const router = Router();
  router.get("/widget/summary", (_req, res) => {
    res.json({ spending_allowance: computeSpendingAllowance(ctx, resolvePeriod(ctx)) });
  });
  return router;
}
