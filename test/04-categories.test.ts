import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { budgetCategories, transactions } from "../src/db/schema.js";
import { runCategorization } from "../src/categorization/engine.js";
import { syncAccounts } from "../src/sync/accounts.js";
import { syncTransactions } from "../src/sync/transactions.js";
import {
  categorizeTransactionTool,
  listCategoriesTool,
  listUncategorizedTool,
  manageCategoriesTool,
  setCategoryRuleTool,
} from "../src/tools/categories.js";
import { invokeTool } from "../src/tools/types.js";
import { putSetting } from "../src/context.js";
import { ReadOnlyError } from "../src/write.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";
import type { AppContext } from "../src/context.js";

async function setup(txns: ReturnType<typeof sampleTransaction>[]): Promise<AppContext> {
  const ctx = testContext();
  const connectionId = seedConnection(ctx);
  const client = new FakeAkahuClient([sampleAccount()], txns);
  await syncAccounts(ctx, [{ connectionId, client }]);
  await syncTransactions(ctx, [{ connectionId, client }]);
  runCategorization(ctx);
  return ctx;
}

function categoryNameOf(ctx: AppContext, txnId: string): string | null {
  const row = ctx.db
    .select({ name: budgetCategories.name })
    .from(transactions)
    .leftJoin(budgetCategories, eq(transactions.budgetCategoryId, budgetCategories.id))
    .where(eq(transactions.akahuId, txnId))
    .get();
  return row?.name ?? null;
}

function categoryIdByName(ctx: AppContext, name: string): number {
  return ctx.db
    .select({ id: budgetCategories.id })
    .from(budgetCategories)
    .where(eq(budgetCategories.name, name))
    .get()!.id;
}

describe("ticket 04 — categorization (Seam 1)", () => {
  it("resolves via group rules seeded from personal_finance; unmatched -> Uncategorized", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "t1", amount: -25, group: "Groceries", merchant: "Countdown" }),
      sampleTransaction({ id: "t2", amount: -10, group: "Transport", merchant: "AT" }),
      sampleTransaction({ id: "t3", amount: -5, description: "Mystery" }), // no group/merchant
    ]);

    expect(categoryNameOf(ctx, "t1")).toBe("Groceries");
    expect(categoryNameOf(ctx, "t2")).toBe("Transport");
    expect(categoryNameOf(ctx, "t3")).toBe("Uncategorized");

    const uncategorized = invokeTool(ctx, listUncategorizedTool, {});
    expect(uncategorized.transactions.map((t) => t.id)).toEqual(["t3"]);
  });

  it("a merchant rule with backfill reclassifies existing history", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "t1", amount: -25, group: "Groceries", merchant: "Countdown" }),
    ]);
    expect(categoryNameOf(ctx, "t1")).toBe("Groceries");

    const kids = invokeTool(ctx, manageCategoriesTool, { action: "create", name: "Kids" });
    const result = invokeTool(ctx, setCategoryRuleTool, {
      match_type: "merchant",
      match_value: "Countdown",
      category_id: kids.id,
      backfill: true,
    });
    expect(result.reclassified).toBe(1);
    expect(categoryNameOf(ctx, "t1")).toBe("Kids");
  });

  it("merge reassigns transactions and keeps totals reconciled", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "t1", amount: -25, group: "Groceries" }),
      sampleTransaction({ id: "t2", amount: -30, group: "Supermarket" }),
    ]);
    const groceries = categoryIdByName(ctx, "Groceries");
    const supermarket = categoryIdByName(ctx, "Supermarket");

    invokeTool(ctx, manageCategoriesTool, {
      action: "merge",
      source_id: supermarket,
      target_id: groceries,
    });

    // Supermarket is gone; both transactions now reconcile under Groceries.
    const cats = invokeTool(ctx, listCategoriesTool, {});
    const names = cats.categories.map((c) => c.name);
    expect(names).not.toContain("Supermarket");
    const grocRow = cats.categories.find((c) => c.name === "Groceries");
    expect(grocRow?.transaction_count).toBe(2);
    // Every transaction still has a category (reconciliation holds).
    expect(ctx.db.select().from(transactions).all().every((t) => t.budgetCategoryId !== null)).toBe(
      true,
    );
  });

  it("a one-off override survives later rule re-derivation", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "t1", amount: -25, group: "Groceries", merchant: "Countdown" }),
    ]);
    const kids = invokeTool(ctx, manageCategoriesTool, { action: "create", name: "Kids" });
    invokeTool(ctx, categorizeTransactionTool, {
      transaction_id: "t1",
      category_id: kids.id,
    });
    expect(categoryNameOf(ctx, "t1")).toBe("Kids");

    // A group rule change + backfill must NOT clobber the manual override.
    const dining = invokeTool(ctx, manageCategoriesTool, { action: "create", name: "Dining" });
    invokeTool(ctx, setCategoryRuleTool, {
      match_type: "akahu_group",
      match_value: "Groceries",
      category_id: dining.id,
      backfill: true,
    });
    expect(categoryNameOf(ctx, "t1")).toBe("Kids");
  });

  it("category writes are refused in read-only mode", async () => {
    const ctx = await setup([]);
    putSetting(ctx, "read_only", "true");
    expect(() =>
      invokeTool(ctx, manageCategoriesTool, { action: "create", name: "Nope" }),
    ).toThrow(ReadOnlyError);
  });
});
