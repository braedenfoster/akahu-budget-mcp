import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDataAsOf } from "../context.js";
import { plannedPurchases } from "../db/schema.js";
import { formatCents } from "../money.js";
import { withWrite } from "../write.js";
import { categoryExists } from "../categorization/engine.js";
import { computeBudget, resolvePeriod } from "../budget/engine.js";
import { planPeriod, type PlanItemInput } from "../planned/engine.js";
import { defineTool } from "./types.js";
import type { AppContext } from "../context.js";

function shapePlanned(r: typeof plannedPurchases.$inferSelect) {
  return {
    id: r.id,
    description: r.description,
    amount_cents: r.amountCents,
    amount_display: formatCents(r.amountCents),
    target_category_id: r.targetCategoryId,
    target_period: r.targetPeriod,
    priority: r.priority,
    status: r.status,
  };
}

function getPlanned(ctx: AppContext, id: number) {
  return ctx.db.select().from(plannedPurchases).where(eq(plannedPurchases.id, id)).get();
}

/** Add a Planned Purchase to the wishlist (user story 36). */
export const addPlannedPurchaseTool = defineTool({
  name: "add_planned_purchase",
  description:
    "Add a Planned Purchase (description, amount in cents, optional target category, target Period YYYY-MM, priority). A list entry, not a reservation. Audited.",
  inputSchema: {
    description: z.string().min(1),
    amount_cents: z.number().int().min(1),
    target_category_id: z.number().int().optional(),
    target_period: z.string().regex(/^\d{4}-\d{2}$/),
    priority: z.number().int().default(0),
  },
  handler: (ctx, input) => {
    if (input.target_category_id !== undefined && !categoryExists(ctx, input.target_category_id))
      throw new Error(`No category with id ${input.target_category_id}.`);
    return withWrite(
      ctx,
      {
        tool: "add_planned_purchase",
        summary: `plan "${input.description}" ${input.amount_cents}c for ${input.target_period}`,
        payload: input,
      },
      () => {
        const now = ctx.now().toISOString();
        const created = ctx.db
          .insert(plannedPurchases)
          .values({
            description: input.description,
            amountCents: input.amount_cents,
            targetCategoryId: input.target_category_id ?? null,
            targetPeriod: input.target_period,
            priority: input.priority,
            status: "planned",
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
        return shapePlanned(created);
      },
    );
  },
});

/** List Planned Purchases, optionally filtered by status and/or target Period. */
export const listPlannedPurchasesTool = defineTool({
  name: "list_planned_purchases",
  description:
    "List Planned Purchases, optionally filtered by status (planned/purchased/dropped) and target Period. Read-only with data-as-of.",
  inputSchema: {
    status: z.enum(["planned", "purchased", "dropped"]).optional(),
    period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  },
  handler: (ctx, input) => {
    const filters = [];
    if (input.status) filters.push(eq(plannedPurchases.status, input.status));
    if (input.period) filters.push(eq(plannedPurchases.targetPeriod, input.period));
    const rows = (filters.length
      ? ctx.db.select().from(plannedPurchases).where(and(...filters))
      : ctx.db.select().from(plannedPurchases)
    )
      .all()
      .sort((a, b) => b.priority - a.priority || a.id - b.id);
    return { planned_purchases: rows.map(shapePlanned), data_as_of: getDataAsOf(ctx) };
  },
});

/** Update mutable fields of a Planned Purchase (user story 37). */
export const updatePlannedPurchaseTool = defineTool({
  name: "update_planned_purchase",
  description:
    "Update a Planned Purchase's description, amount, target category, target Period, or priority. Audited.",
  inputSchema: {
    id: z.number().int(),
    description: z.string().min(1).optional(),
    amount_cents: z.number().int().min(1).optional(),
    target_category_id: z.number().int().nullable().optional(),
    target_period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    priority: z.number().int().optional(),
  },
  handler: (ctx, input) => {
    const existing = getPlanned(ctx, input.id);
    if (!existing) throw new Error(`No planned purchase with id ${input.id}.`);
    if (
      input.target_category_id !== undefined &&
      input.target_category_id !== null &&
      !categoryExists(ctx, input.target_category_id)
    )
      throw new Error(`No category with id ${input.target_category_id}.`);
    return withWrite(
      ctx,
      { tool: "update_planned_purchase", summary: `update planned ${input.id}`, payload: input },
      () => {
        const patch: Partial<typeof plannedPurchases.$inferInsert> = { updatedAt: ctx.now().toISOString() };
        if (input.description !== undefined) patch.description = input.description;
        if (input.amount_cents !== undefined) patch.amountCents = input.amount_cents;
        if (input.target_category_id !== undefined) patch.targetCategoryId = input.target_category_id;
        if (input.target_period !== undefined) patch.targetPeriod = input.target_period;
        if (input.priority !== undefined) patch.priority = input.priority;
        ctx.db.update(plannedPurchases).set(patch).where(eq(plannedPurchases.id, input.id)).run();
        return shapePlanned(getPlanned(ctx, input.id)!);
      },
    );
  },
});

function statusTool(name: string, status: "purchased" | "dropped", verb: string) {
  return defineTool({
    name,
    description: `Mark a Planned Purchase as ${status} (${verb}). Audited.`,
    inputSchema: { id: z.number().int() },
    handler: (ctx, input) => {
      const existing = getPlanned(ctx, input.id);
      if (!existing) throw new Error(`No planned purchase with id ${input.id}.`);
      return withWrite(
        ctx,
        { tool: name, summary: `${status} planned ${input.id}`, payload: input },
        () => {
          ctx.db
            .update(plannedPurchases)
            .set({ status, updatedAt: ctx.now().toISOString() })
            .where(eq(plannedPurchases.id, input.id))
            .run();
          return shapePlanned(getPlanned(ctx, input.id)!);
        },
      );
    },
  });
}

/** Retire a Planned Purchase once bought (user story 39; V1 is manual). */
export const markPurchasedTool = statusTool("mark_purchased", "purchased", "retire once bought");

/** Remove a Planned Purchase from the active wishlist. */
export const dropPlannedPurchaseTool = statusTool("drop_planned_purchase", "dropped", "drop from wishlist");

/**
 * Test the whole wishlist for a Period against real remaining money, greedily by
 * priority (user story 38). Only `planned` items whose target_period equals the
 * Period are considered — future-Period items are excluded. Read-only: reserves
 * nothing, mutates nothing.
 */
export const planPeriodTool = defineTool({
  name: "plan_period",
  description:
    "Greedily test all planned wishlist items for a Period (by priority) against real remaining Envelope room and Household headroom. Each item is fits / fits_if_reallocated / doesnt_fit. Read-only; reserves nothing.",
  inputSchema: { period: z.string().regex(/^\d{4}-\d{2}$/).optional() },
  handler: (ctx, input) => {
    const period = resolvePeriod(ctx, input.period);
    const snapshot = computeBudget(ctx, period);
    const rows = ctx.db
      .select()
      .from(plannedPurchases)
      .where(
        and(
          eq(plannedPurchases.status, "planned"),
          eq(plannedPurchases.targetPeriod, period.key),
        ),
      )
      .all();
    const items: PlanItemInput[] = rows.map((r) => ({
      id: r.id,
      description: r.description,
      amountCents: r.amountCents,
      targetCategoryId: r.targetCategoryId,
      priority: r.priority,
    }));
    const plan = planPeriod(snapshot, items);
    return {
      period: { key: period.key, start: period.startDate, end: period.endDate },
      ...plan,
      data_as_of: getDataAsOf(ctx),
    };
  },
});
