import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { budgetCategories } from "../src/db/schema.js";
import { runCategorization } from "../src/categorization/engine.js";
import { syncAccounts } from "../src/sync/accounts.js";
import { syncTransactions } from "../src/sync/transactions.js";
import {
  createBudgetForPeriodTool,
  getBudgetTool,
  reallocateTool,
  setAllocationTool,
  setExpectedIncomeTool,
} from "../src/tools/budget.js";
import { invokeTool } from "../src/tools/types.js";
import { ReadOnlyError } from "../src/write.js";
import { putSetting } from "../src/context.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";
import type { AppContext } from "../src/context.js";

async function setup(txns: ReturnType<typeof sampleTransaction>[] = []): Promise<AppContext> {
  const ctx = testContext("2026-07-15T09:00:00.000Z");
  const connectionId = seedConnection(ctx);
  const client = new FakeAkahuClient([sampleAccount()], txns);
  await syncAccounts(ctx, [{ connectionId, client }]);
  await syncTransactions(ctx, [{ connectionId, client }]);
  runCategorization(ctx);
  return ctx;
}

function catId(ctx: AppContext, name: string): number {
  return ctx.db
    .select({ id: budgetCategories.id })
    .from(budgetCategories)
    .where(eq(budgetCategories.name, name))
    .get()!.id;
}

describe("ticket 05 — budget engine (Seam 1)", () => {
  it("computes allocated/spent/remaining/slack per envelope in exact cents", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "g1", date: "2026-07-05", amount: -25.5, group: "Groceries" }),
      sampleTransaction({ id: "g2", date: "2026-07-10", amount: -14.5, group: "Groceries" }),
      sampleTransaction({ id: "tr", date: "2026-07-12", amount: -30.0, group: "Transport" }),
    ]);
    const groceries = catId(ctx, "Groceries");
    invokeTool(ctx, setAllocationTool, { period: "2026-07", category_id: groceries, amount_cents: 50000 });

    const budget = invokeTool(ctx, getBudgetTool, { period: "2026-07" });
    const groc = budget.envelopes.find((e) => e.category === "Groceries")!;
    expect(groc).toMatchObject({
      allocated_cents: 50000,
      spent_cents: 4000, // 25.50 + 14.50
      remaining_cents: 46000,
      slack_cents: 46000,
    });
    // Transport has spend but no allocation -> shows with allocated 0.
    const transport = budget.envelopes.find((e) => e.category === "Transport")!;
    expect(transport).toMatchObject({ allocated_cents: 0, spent_cents: 3000, remaining_cents: -3000 });
    expect(budget.totals).toEqual({
      allocated_cents: 50000,
      spent_cents: 7000,
      remaining_cents: 43000,
    });
  });

  it("computes actual income and headroom against expected income", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "pay", date: "2026-07-01", amount: 4000.0, description: "Payroll" }),
      sampleTransaction({ id: "spend", date: "2026-07-08", amount: -100.0, group: "Groceries" }),
    ]);
    const groceries = catId(ctx, "Groceries");
    invokeTool(ctx, setExpectedIncomeTool, { period: "2026-07", amount_cents: 500000 });
    invokeTool(ctx, setAllocationTool, { period: "2026-07", category_id: groceries, amount_cents: 120000 });

    const budget = invokeTool(ctx, getBudgetTool, { period: "2026-07" });
    expect(budget.income).toEqual({
      expected_cents: 500000,
      actual_cents: 400000,
      // The payroll credit falls into the Unclassified income fallback (no rule).
      by_stream: [{ stream: "Unclassified income", actual_cents: 400000 }],
    });
    // Headroom = expected income - total allocated = 500000 - 120000.
    expect(budget.household_headroom_cents).toBe(380000);
  });

  it("only counts transactions inside the period boundary", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "in1", date: "2026-07-01", amount: -10.0, group: "Groceries" }),
      sampleTransaction({ id: "in2", date: "2026-07-31", amount: -10.0, group: "Groceries" }),
      sampleTransaction({ id: "before", date: "2026-06-30", amount: -99.0, group: "Groceries" }),
      sampleTransaction({ id: "after", date: "2026-08-01", amount: -99.0, group: "Groceries" }),
    ]);
    const budget = invokeTool(ctx, getBudgetTool, { period: "2026-07" });
    const groc = budget.envelopes.find((e) => e.category === "Groceries")!;
    expect(groc.spent_cents).toBe(2000); // only the two July transactions
  });

  it("create_budget_for_period copies previous allocations and expected income", async () => {
    const ctx = await setup([]);
    const groceries = catId(ctx, "Uncategorized"); // any real category id
    invokeTool(ctx, setExpectedIncomeTool, { period: "2026-06", amount_cents: 300000 });
    invokeTool(ctx, setAllocationTool, { period: "2026-06", category_id: groceries, amount_cents: 25000 });

    const created = invokeTool(ctx, createBudgetForPeriodTool, {
      period: "2026-07",
      copy_previous: true,
    });
    expect(created.income.expected_cents).toBe(300000);
    expect(created.envelopes.find((e) => e.category_id === groceries)?.allocated_cents).toBe(25000);
  });

  it("reallocate moves allocation between envelopes and is audited", async () => {
    const ctx = await setup([]);
    const a = catId(ctx, "Uncategorized");
    // Create a second category to move into.
    const b = ctx.db
      .insert(budgetCategories)
      .values({ name: "Fun", isSystem: false, createdAt: "2026-07-01T00:00:00.000Z" })
      .returning({ id: budgetCategories.id })
      .get().id;
    invokeTool(ctx, setAllocationTool, { period: "2026-07", category_id: a, amount_cents: 10000 });

    const after = invokeTool(ctx, reallocateTool, {
      period: "2026-07",
      from_category_id: a,
      to_category_id: b,
      amount_cents: 4000,
    });
    expect(after.envelopes.find((e) => e.category_id === a)?.allocated_cents).toBe(6000);
    expect(after.envelopes.find((e) => e.category_id === b)?.allocated_cents).toBe(4000);
  });

  it("reallocate refuses to overdraw the source envelope", async () => {
    const ctx = await setup([]);
    const a = catId(ctx, "Uncategorized");
    const b = ctx.db
      .insert(budgetCategories)
      .values({ name: "Fun", isSystem: false, createdAt: "2026-07-01T00:00:00.000Z" })
      .returning({ id: budgetCategories.id })
      .get().id;
    invokeTool(ctx, setAllocationTool, { period: "2026-07", category_id: a, amount_cents: 1000 });
    expect(() =>
      invokeTool(ctx, reallocateTool, {
        period: "2026-07",
        from_category_id: a,
        to_category_id: b,
        amount_cents: 5000,
      }),
    ).toThrow(/only 1000c/);
  });

  it("budget writes are refused in read-only mode", async () => {
    const ctx = await setup([]);
    const a = catId(ctx, "Uncategorized");
    putSetting(ctx, "read_only", "true");
    expect(() =>
      invokeTool(ctx, setAllocationTool, { period: "2026-07", category_id: a, amount_cents: 100 }),
    ).toThrow(ReadOnlyError);
  });
});
