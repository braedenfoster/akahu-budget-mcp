import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDataAsOf } from "../context.js";
import { budgets } from "../db/schema.js";
import { withWrite } from "../write.js";
import { categoryExists } from "../categorization/engine.js";
import {
  computeBudget,
  copyAllocations,
  ensureBudget,
  findBudget,
  reallocate,
  resolvePeriod,
  setAllocation,
} from "../budget/engine.js";
import { computeAllocatedByKind, computeSpendingAllowance } from "../budget/allowance.js";
import { previousPeriod } from "../period.js";
import { budgetMonthStartDay } from "../context.js";
import { defineTool } from "./types.js";
import { optionalPeriod as periodInput } from "./schemas.js";

/** Return the full computed Budget picture for a Period (user story 26). */
export const getBudgetTool = defineTool({
  name: "get_budget",
  description:
    "Return the Budget for a Period: per-Envelope allocated/spent/remaining/slack (integer cents), expected + actual income, totals, Household headroom, allocations totalled by kind (Committed and Flexible, excluding Uncategorized), the Spending allowance (Flexible money left, its parts, per-week figure, status, Uncategorized count, stale flag), and data-as-of. All math is server-side.",
  inputSchema: { period: periodInput },
  handler: (ctx, input) => {
    const period = resolvePeriod(ctx, input.period);
    return {
      ...computeBudget(ctx, period),
      allocated_by_kind: computeAllocatedByKind(ctx, period),
      spending_allowance: computeSpendingAllowance(ctx, period),
      data_as_of: getDataAsOf(ctx),
    };
  },
});

/** Initialise a Period's Budget, optionally copying the previous Period. */
export const createBudgetForPeriodTool = defineTool({
  name: "create_budget_for_period",
  description:
    "Create the Budget for a Period, optionally copying the previous Period's allocations and expected income. Audited; refused in read-only mode.",
  inputSchema: {
    period: periodInput,
    copy_previous: z.boolean().default(false),
  },
  handler: (ctx, input) => {
    const period = resolvePeriod(ctx, input.period);
    return withWrite(
      ctx,
      {
        tool: "create_budget_for_period",
        summary: `create budget ${period.key}${input.copy_previous ? " (copy previous)" : ""}`,
        payload: { period: period.key, copy_previous: input.copy_previous },
      },
      () => {
        const budgetId = ensureBudget(ctx, period);
        if (input.copy_previous) {
          const prev = findBudget(ctx, previousPeriod(period, budgetMonthStartDay(ctx)).key);
          if (prev) {
            copyAllocations(ctx, prev.id, budgetId);
            if (prev.expectedIncomeCents !== null) {
              ctx.db
                .update(budgets)
                .set({ expectedIncomeCents: prev.expectedIncomeCents })
                .where(eq(budgets.id, budgetId))
                .run();
            }
          }
        }
        return computeBudget(ctx, period);
      },
    );
  },
});

/** Set an Envelope's allocation for a Period (user story 25). */
export const setAllocationTool = defineTool({
  name: "set_allocation",
  description:
    "Set a Budget Category's Envelope allocation (integer cents) for a Period. Audited; refused in read-only mode.",
  inputSchema: {
    period: periodInput,
    category_id: z.number().int(),
    amount_cents: z.number().int().min(0),
  },
  handler: (ctx, input) => {
    if (!categoryExists(ctx, input.category_id))
      throw new Error(`No category with id ${input.category_id}.`);
    const period = resolvePeriod(ctx, input.period);
    return withWrite(
      ctx,
      {
        tool: "set_allocation",
        summary: `allocate ${input.amount_cents}c to category ${input.category_id} for ${period.key}`,
        payload: { period: period.key, ...input },
      },
      () => {
        const budgetId = ensureBudget(ctx, period);
        setAllocation(ctx, budgetId, input.category_id, input.amount_cents);
        return computeBudget(ctx, period);
      },
    );
  },
});

/** Set the Household's expected income for a Period (user story 27). */
export const setExpectedIncomeTool = defineTool({
  name: "set_expected_income",
  description:
    "Set the Household's expected income (integer cents) for a Period. Audited; refused in read-only mode.",
  inputSchema: {
    period: periodInput,
    amount_cents: z.number().int().min(0),
  },
  handler: (ctx, input) => {
    const period = resolvePeriod(ctx, input.period);
    return withWrite(
      ctx,
      {
        tool: "set_expected_income",
        summary: `expected income ${input.amount_cents}c for ${period.key}`,
        payload: { period: period.key, amount_cents: input.amount_cents },
      },
      () => {
        const budgetId = ensureBudget(ctx, period);
        ctx.db
          .update(budgets)
          .set({ expectedIncomeCents: input.amount_cents })
          .where(eq(budgets.id, budgetId))
          .run();
        return computeBudget(ctx, period);
      },
    );
  },
});

/**
 * Move allocation from one Envelope to another (Reallocate, user story 29). An
 * explicit, audited planning write — no real money moves. Allocations stay
 * non-negative: you cannot move out more than the source Envelope holds.
 */
export const reallocateTool = defineTool({
  name: "reallocate",
  description:
    "Move allocation (integer cents) from one Budget Category's Envelope to another for a Period. Audited; refused in read-only mode. No real money moves.",
  inputSchema: {
    period: periodInput,
    from_category_id: z.number().int(),
    to_category_id: z.number().int(),
    amount_cents: z.number().int().min(1),
  },
  handler: (ctx, input) => {
    if (input.from_category_id === input.to_category_id)
      throw new Error("Cannot reallocate a category to itself.");
    if (!categoryExists(ctx, input.from_category_id))
      throw new Error(`No category with id ${input.from_category_id}.`);
    if (!categoryExists(ctx, input.to_category_id))
      throw new Error(`No category with id ${input.to_category_id}.`);
    const period = resolvePeriod(ctx, input.period);
    return withWrite(
      ctx,
      {
        tool: "reallocate",
        summary: `reallocate ${input.amount_cents}c from ${input.from_category_id} to ${input.to_category_id} (${period.key})`,
        payload: { period: period.key, ...input },
      },
      () => {
        const budgetId = ensureBudget(ctx, period);
        reallocate(ctx, budgetId, input.from_category_id, input.to_category_id, input.amount_cents);
        return computeBudget(ctx, period);
      },
    );
  },
});
