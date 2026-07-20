import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { budgetCategories } from "../src/db/schema.js";
import { runCategorization } from "../src/categorization/engine.js";
import { syncAccounts } from "../src/sync/accounts.js";
import { syncTransactions } from "../src/sync/transactions.js";
import { setAllocationTool } from "../src/tools/budget.js";
import { getPeriodSummaryTool } from "../src/tools/reports.js";
import { invokeTool } from "../src/tools/types.js";
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

async function seededMonths(): Promise<AppContext> {
  const ctx = testContext("2026-07-20T09:00:00.000Z");
  const connectionId = seedConnection(ctx);
  const txns = [
    // July
    sampleTransaction({ id: "j_g1", date: "2026-07-05", amount: -50.0, group: "Groceries" }),
    sampleTransaction({ id: "j_g2", date: "2026-07-06", amount: -30.0, group: "Groceries", merchant: "Countdown" }),
    sampleTransaction({ id: "j_t1", date: "2026-07-08", amount: -20.0, group: "Transport", merchant: "AT" }),
    sampleTransaction({ id: "j_u1", date: "2026-07-10", amount: -15.0, merchant: "Mystery" }), // Uncategorized
    sampleTransaction({ id: "j_pay", date: "2026-07-01", amount: 4000.0, description: "Payroll" }),
    // June (no budget for this Period)
    sampleTransaction({ id: "ju_g1", date: "2026-06-10", amount: -40.0, group: "Groceries" }),
  ];
  const client = new FakeAkahuClient([sampleAccount()], txns);
  await syncAccounts(ctx, [{ connectionId, client }]);
  await syncTransactions(ctx, [{ connectionId, client }]);
  runCategorization(ctx);
  invokeTool(ctx, setAllocationTool, {
    period: "2026-07",
    category_id: catId(ctx, "Groceries"),
    amount_cents: 10000,
  });
  return ctx;
}

describe("ticket 08 — get_period_summary (Seam 1)", () => {
  it("aggregates per-category spend vs allocated, income vs spend, merchants, trend", async () => {
    const ctx = await seededMonths();
    const out = invokeTool(ctx, getPeriodSummaryTool, { period: "2026-07", trend_periods: 2 });

    const groceries = out.categories.find((c) => c.category === "Groceries")!;
    expect(groceries).toMatchObject({ allocated_cents: 10000, spent_cents: 8000, remaining_cents: 2000 });
    expect(out.categories.find((c) => c.category === "Transport")).toMatchObject({
      allocated_cents: 0,
      spent_cents: 2000,
    });
    // Uncategorized spend is included like any other category.
    expect(out.categories.find((c) => c.category === "Uncategorized")).toMatchObject({
      spent_cents: 1500,
    });

    expect(out.income_vs_spend).toEqual({
      income_cents: 400000,
      spent_cents: 11500, // 8000 + 2000 + 1500
      net_cents: 388500,
      // The payroll credit falls into the Unclassified income fallback (no rule).
      by_stream: [{ stream: "Unclassified income", actual_cents: 400000 }],
    });

    expect(out.top_merchants).toEqual([
      { merchant: "Countdown", spent_cents: 3000 },
      { merchant: "AT", spent_cents: 2000 },
      { merchant: "Mystery", spent_cents: 1500 },
    ]);

    // Trend oldest-first over two Periods.
    expect(out.trend).toEqual([
      { period: "2026-06", spent_cents: 4000, income_cents: 0 },
      { period: "2026-07", spent_cents: 11500, income_cents: 400000 },
    ]);
  });

  it("summarizes a Period with no Budget using actual spend", async () => {
    const ctx = await seededMonths();
    const out = invokeTool(ctx, getPeriodSummaryTool, { period: "2026-06" });
    expect(out.has_budget).toBe(false);
    expect(out.categories.find((c) => c.category === "Groceries")).toMatchObject({
      allocated_cents: 0,
      spent_cents: 4000,
    });
    expect(out.income_vs_spend.spent_cents).toBe(4000);
  });
});
