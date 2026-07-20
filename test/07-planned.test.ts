import { describe, expect, it } from "vitest";
import { budgetCategories } from "../src/db/schema.js";
import { setAllocationTool } from "../src/tools/budget.js";
import {
  addPlannedPurchaseTool,
  dropPlannedPurchaseTool,
  listPlannedPurchasesTool,
  markPurchasedTool,
  planPeriodTool,
  updatePlannedPurchaseTool,
} from "../src/tools/planned.js";
import { invokeTool } from "../src/tools/types.js";
import { putSetting } from "../src/context.js";
import { ReadOnlyError } from "../src/write.js";
import { testContext } from "./helpers.js";
import type { AppContext } from "../src/context.js";

function makeCategory(ctx: AppContext, name: string): number {
  return ctx.db
    .insert(budgetCategories)
    .values({ name, isSystem: false, createdAt: "2026-07-01T00:00:00.000Z" })
    .returning({ id: budgetCategories.id })
    .get().id;
}

function add(
  ctx: AppContext,
  args: {
    description: string;
    amount_cents: number;
    target_category_id?: number;
    target_period?: string;
    priority?: number;
  },
): number {
  const out = invokeTool(ctx, addPlannedPurchaseTool, {
    target_period: "2026-07",
    ...args,
  }) as { id: number };
  return out.id;
}

describe("ticket 07 — planned purchases CRUD (Seam 1)", () => {
  it("adds, lists, updates, marks purchased, and drops", async () => {
    const ctx = testContext("2026-07-15T09:00:00.000Z");
    const id = add(ctx, { description: "Blender", amount_cents: 9900, priority: 3 });

    let list = invokeTool(ctx, listPlannedPurchasesTool, { status: "planned" });
    expect(list.planned_purchases).toHaveLength(1);
    expect(list.planned_purchases[0]).toMatchObject({ description: "Blender", amount_cents: 9900 });

    invokeTool(ctx, updatePlannedPurchaseTool, { id, amount_cents: 12000, priority: 7 });
    invokeTool(ctx, markPurchasedTool, { id });
    list = invokeTool(ctx, listPlannedPurchasesTool, { status: "purchased" });
    expect(list.planned_purchases[0]).toMatchObject({ amount_cents: 12000, status: "purchased" });

    const id2 = add(ctx, { description: "Lamp", amount_cents: 5000 });
    invokeTool(ctx, dropPlannedPurchaseTool, { id: id2 });
    const dropped = invokeTool(ctx, listPlannedPurchasesTool, { status: "dropped" });
    expect(dropped.planned_purchases.map((p) => p.id)).toEqual([id2]);
  });

  it("refuses writes in read-only mode", async () => {
    const ctx = testContext();
    putSetting(ctx, "read_only", "true");
    expect(() =>
      invokeTool(ctx, addPlannedPurchaseTool, {
        description: "X",
        amount_cents: 100,
        target_period: "2026-07",
      }),
    ).toThrow(ReadOnlyError);
  });
});

describe("ticket 07 — plan_period (Seam 1)", () => {
  function scenario(): { ctx: AppContext; fun: number; gifts: number } {
    const ctx = testContext("2026-07-15T09:00:00.000Z");
    const fun = makeCategory(ctx, "Fun");
    const gifts = makeCategory(ctx, "Gifts");
    invokeTool(ctx, setAllocationTool, { period: "2026-07", category_id: fun, amount_cents: 10000 });
    invokeTool(ctx, setAllocationTool, { period: "2026-07", category_id: gifts, amount_cents: 5000 });
    return { ctx, fun, gifts };
  }

  it("fits by priority order and excludes future-Period items", () => {
    const { ctx, fun, gifts } = scenario();
    const tv = add(ctx, { description: "TV", amount_cents: 8000, target_category_id: fun, priority: 10 });
    const speaker = add(ctx, { description: "Speaker", amount_cents: 5000, target_category_id: fun, priority: 5 });
    const card = add(ctx, { description: "Card", amount_cents: 4000, target_category_id: gifts, priority: 1 });
    // Future-Period item — must not appear in the July plan.
    add(ctx, { description: "Holiday", amount_cents: 100000, target_category_id: fun, target_period: "2026-12", priority: 100 });

    const plan = invokeTool(ctx, planPeriodTool, { period: "2026-07" });
    const byId = Object.fromEntries(plan.items.map((i) => [i.id, i]));

    expect(plan.items.map((i) => i.id)).toEqual([tv, speaker, card]); // priority order, holiday excluded
    expect(byId[tv]).toMatchObject({ verdict: "fits", shortfall_cents: 0 });
    expect(byId[speaker]).toMatchObject({ verdict: "fits_if_reallocated", shortfall_cents: 3000 });
    expect(byId[card]).toMatchObject({ verdict: "doesnt_fit", shortfall_cents: 2000 });
    expect(plan.summary).toEqual({ fits: 1, fits_if_reallocated: 1, doesnt_fit: 1 });
  });

  it("breaks priority ties by insertion order", () => {
    const ctx = testContext("2026-07-15T09:00:00.000Z");
    const fun = makeCategory(ctx, "Fun");
    invokeTool(ctx, setAllocationTool, { period: "2026-07", category_id: fun, amount_cents: 5000 });

    const first = add(ctx, { description: "A", amount_cents: 5000, target_category_id: fun, priority: 5 });
    const second = add(ctx, { description: "B", amount_cents: 5000, target_category_id: fun, priority: 5 });

    const plan = invokeTool(ctx, planPeriodTool, { period: "2026-07" });
    expect(plan.items.map((i) => i.id)).toEqual([first, second]);
    expect(plan.items[0]).toMatchObject({ verdict: "fits" });
    expect(plan.items[1]).toMatchObject({ verdict: "doesnt_fit" });
  });
});
