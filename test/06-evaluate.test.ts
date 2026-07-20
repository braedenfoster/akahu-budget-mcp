import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { budgetCategories } from "../src/db/schema.js";
import { runCategorization } from "../src/categorization/engine.js";
import { syncAccounts } from "../src/sync/accounts.js";
import { syncTransactions } from "../src/sync/transactions.js";
import { setAllocationTool, setExpectedIncomeTool } from "../src/tools/budget.js";
import { evaluatePurchaseTool } from "../src/tools/evaluate.js";
import { invokeTool } from "../src/tools/types.js";
import { putSetting } from "../src/context.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";
import type { AppContext } from "../src/context.js";

function catId(ctx: AppContext, name: string): number {
  return ctx.db
    .select({ id: budgetCategories.id })
    .from(budgetCategories)
    .where(eq(budgetCategories.name, name))
    .get()!.id;
}

/**
 * Scenario: Groceries allocated 50000 / spent 40000 (remaining 10000);
 * Fun allocated 20000 / spent 0 (slack 20000). No income -> headroom clamps to 0.
 */
async function scenario(): Promise<{ ctx: AppContext; groceries: number; fun: number }> {
  const ctx = testContext("2026-07-15T09:00:00.000Z");
  const connectionId = seedConnection(ctx);
  const client = new FakeAkahuClient(
    [sampleAccount()],
    [sampleTransaction({ id: "g1", date: "2026-07-05", amount: -400.0, group: "Groceries" })],
  );
  await syncAccounts(ctx, [{ connectionId, client }]);
  await syncTransactions(ctx, [{ connectionId, client }]);
  runCategorization(ctx);

  const groceries = catId(ctx, "Groceries");
  const fun = ctx.db
    .insert(budgetCategories)
    .values({ name: "Fun", isSystem: false, createdAt: "2026-07-01T00:00:00.000Z" })
    .returning({ id: budgetCategories.id })
    .get().id;

  invokeTool(ctx, setAllocationTool, { period: "2026-07", category_id: groceries, amount_cents: 50000 });
  invokeTool(ctx, setAllocationTool, { period: "2026-07", category_id: fun, amount_cents: 20000 });
  return { ctx, groceries, fun };
}

describe("ticket 06 — evaluate_purchase (Seam 1)", () => {
  it("comfortably fits within the target envelope", async () => {
    const { ctx, groceries } = await scenario();
    const out = invokeTool(ctx, evaluatePurchaseTool, {
      period: "2026-07",
      amount_cents: 5000,
      category_id: groceries,
    });
    expect(out.verdict).toBe("fits");
    expect(out.shortfall_cents).toBe(0);
    expect(out.target).toMatchObject({ category_id: groceries, remaining_cents: 10000 });
    expect(out.days_left).toBe(17);
  });

  it("fits only via reallocation, ranking other envelopes' slack", async () => {
    const { ctx, groceries, fun } = await scenario();
    const out = invokeTool(ctx, evaluatePurchaseTool, {
      period: "2026-07",
      amount_cents: 25000,
      category_id: groceries,
    });
    expect(out.verdict).toBe("fits_if_reallocated");
    expect(out.shortfall_cents).toBe(15000); // 25000 - 10000 remaining
    expect(out.ranked_reallocatable_slack).toEqual([
      { category_id: fun, category: "Fun", slack_cents: 20000 },
    ]);
  });

  it("doesn't fit at all when slack + headroom can't cover the shortfall", async () => {
    const { ctx, groceries } = await scenario();
    const out = invokeTool(ctx, evaluatePurchaseTool, {
      period: "2026-07",
      amount_cents: 40000,
      category_id: groceries,
    });
    expect(out.verdict).toBe("doesnt_fit");
    expect(out.shortfall_cents).toBe(30000); // 40000 - 10000; only 20000 slack
    // No income, 70000 allocated -> over-allocated: headroom is negative and
    // contributes nothing to covering the shortfall (clamped at 0 internally).
    expect(out.household_headroom_cents).toBe(-70000);
  });

  it("with no category, evaluates against Household headroom", async () => {
    const { ctx, groceries } = await scenario();
    // Give the Household 100000 headroom: expected income 170000 - allocated 70000.
    invokeTool(ctx, setExpectedIncomeTool, { period: "2026-07", amount_cents: 170000 });

    const fits = invokeTool(ctx, evaluatePurchaseTool, { period: "2026-07", amount_cents: 90000 });
    expect(fits.target).toBeNull();
    expect(fits.verdict).toBe("fits");
    expect(fits.household_headroom_cents).toBe(100000);

    const overHeadroom = invokeTool(ctx, evaluatePurchaseTool, {
      period: "2026-07",
      amount_cents: 130000,
    });
    // 130000 - 100000 headroom = 30000 shortfall; Groceries slack 10000 + Fun 20000 = 30000 covers.
    expect(overHeadroom.verdict).toBe("fits_if_reallocated");
    expect(overHeadroom.shortfall_cents).toBe(30000);
    // Groceries category still exists but is not the target, so it's rankable.
    expect(overHeadroom.ranked_reallocatable_slack.map((r) => r.category_id).sort()).toEqual(
      [groceries, catId(ctx, "Fun")].sort(),
    );
  });

  it("is read-only: mutates nothing and works in read-only mode", async () => {
    const { ctx, groceries } = await scenario();
    const before = ctx.db.select().from(budgetCategories).all().length;
    putSetting(ctx, "read_only", "true");
    const out = invokeTool(ctx, evaluatePurchaseTool, {
      period: "2026-07",
      amount_cents: 5000,
      category_id: groceries,
    });
    expect(out.verdict).toBe("fits");
    expect(ctx.db.select().from(budgetCategories).all().length).toBe(before);
  });
});
