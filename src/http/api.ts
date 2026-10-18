import { Router } from "express";
import { computeSpendingAllowance } from "../budget/allowance.js";
import { resolvePeriod } from "../budget/engine.js";
import type { AppContext } from "../context.js";

/**
 * REST routes for the native app (ADR-0013). They have no auth of their own,
 * so mount them on the public listener behind the authenticate middleware only.
 */
export function buildApiRouter(ctx: AppContext): Router {
  const router = Router();
  router.get("/spending-allowance", (_req, res) => {
    res.json({ spending_allowance: computeSpendingAllowance(ctx, resolvePeriod(ctx)) });
  });
  return router;
}
