import { z } from "zod";
import { getDataAsOf } from "../context.js";
import { computeBudget, resolvePeriod } from "../budget/engine.js";
import { evaluatePurchase } from "../analysis/evaluate.js";
import { daysLeftInPeriod } from "../period.js";
import { categoryExists } from "../categorization/engine.js";
import { defineTool } from "./types.js";

/**
 * Advisory, strictly read-only purchase evaluation (ticket 06, ADR-0003). Never
 * mutates state; asking "what if" changes nothing.
 */
export const evaluatePurchaseTool = defineTool({
  name: "evaluate_purchase",
  description:
    "Read-only: can the Household afford a purchase of `amount_cents` (optionally in a target category)? Returns the target Envelope remaining, a fit verdict + shortfall, ranked reallocatable Slack from other Envelopes, Household headroom, days left in the Period, and data-as-of. Mutates nothing.",
  inputSchema: {
    amount_cents: z.number().int().min(1).describe("Purchase amount in integer cents"),
    category_id: z
      .number()
      .int()
      .optional()
      .describe("Target Budget Category; omit to evaluate against Household headroom only"),
    period: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  },
  handler: (ctx, input) => {
    if (input.category_id !== undefined && !categoryExists(ctx, input.category_id))
      throw new Error(`No category with id ${input.category_id}.`);
    const period = resolvePeriod(ctx, input.period);
    const snapshot = computeBudget(ctx, period);
    const daysLeft = daysLeftInPeriod(period, ctx.now().toISOString());
    const evaluation = evaluatePurchase(snapshot, input.amount_cents, input.category_id, daysLeft);
    return {
      period: { key: period.key, start: period.startDate, end: period.endDate },
      ...evaluation,
      data_as_of: getDataAsOf(ctx),
    };
  },
});
