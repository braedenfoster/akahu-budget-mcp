import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, budgetCategories, mappingRules, transactions } from "../src/db/schema.js";
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
import { listTransactionsTool } from "../src/tools/transactions.js";
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

function createCategory(ctx: AppContext, name: string): number {
  const created = invokeTool(ctx, manageCategoriesTool, {
    action: "create",
    name,
    kind: "committed",
  }) as {
    id: number;
  };
  return created.id;
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

  it("list_transactions can filter by Budget Category (user story 14)", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "t1", amount: -25, group: "Groceries" }),
      sampleTransaction({ id: "t2", amount: -10, group: "Transport" }),
    ]);
    const groceries = categoryIdByName(ctx, "Groceries");
    const out = invokeTool(ctx, listTransactionsTool, { category_id: groceries });
    expect(out.transactions.map((t) => t.id)).toEqual(["t1"]);
  });

  it("routes by txn_type when merchant/group are absent (e.g. mortgage type=LOAN)", async () => {
    const ctx = await setup([
      sampleTransaction({
        id: "m1",
        amount: -2350.8,
        type: "LOAN",
        description: "AP#25174032 TO A VAN DEN HEEVER, B L FOSTER",
      }),
    ]);
    // No merchant, no group -> starts Uncategorized.
    expect(categoryNameOf(ctx, "m1")).toBe("Uncategorized");

    const housing = createCategory(ctx, "Housing");
    invokeTool(ctx, setCategoryRuleTool, {
      match_type: "txn_type",
      match_value: "LOAN",
      category_id: housing,
      backfill: true,
    });
    expect(categoryNameOf(ctx, "m1")).toBe("Housing");
  });

  it("routes by description substring (case-insensitive)", async () => {
    const ctx = await setup([
      sampleTransaction({
        id: "e1",
        amount: -154,
        type: "STANDING ORDER",
        description: "AP#26066736 TO EDUCATIONAL HOLDINGS LTD",
      }),
    ]);
    const edu = createCategory(ctx, "Education");
    invokeTool(ctx, setCategoryRuleTool, {
      match_type: "description",
      match_value: "educational holdings",
      category_id: edu,
      backfill: true,
    });
    expect(categoryNameOf(ctx, "e1")).toBe("Education");
  });

  it("precedence: a merchant rule beats a description rule", async () => {
    const ctx = await setup([
      sampleTransaction({
        id: "x1",
        amount: -20,
        merchant: "Countdown",
        description: "COUNTDOWN EDUCATIONAL SUPPLIES",
      }),
    ]);
    const edu = createCategory(ctx, "Education");
    const kids = createCategory(ctx, "Kids");
    invokeTool(ctx, setCategoryRuleTool, {
      match_type: "description",
      match_value: "EDUCATIONAL",
      category_id: edu,
      backfill: true,
    });
    invokeTool(ctx, setCategoryRuleTool, {
      match_type: "merchant",
      match_value: "Countdown",
      category_id: kids,
      backfill: true,
    });
    expect(categoryNameOf(ctx, "x1")).toBe("Kids");
  });

  it("a merchant rule with backfill reclassifies existing history", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "t1", amount: -25, group: "Groceries", merchant: "Countdown" }),
    ]);
    expect(categoryNameOf(ctx, "t1")).toBe("Groceries");

    const kidsId = createCategory(ctx, "Kids");
    const result = invokeTool(ctx, setCategoryRuleTool, {
      match_type: "merchant",
      match_value: "Countdown",
      category_id: kidsId,
      backfill: true,
    });
    expect(result).toMatchObject({ reclassified: 1 });
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
    const kidsId = createCategory(ctx, "Kids");
    invokeTool(ctx, categorizeTransactionTool, {
      transaction_id: "t1",
      category_id: kidsId,
    });
    expect(categoryNameOf(ctx, "t1")).toBe("Kids");

    // A group rule change + backfill must NOT clobber the manual override.
    const diningId = createCategory(ctx, "Dining");
    invokeTool(ctx, setCategoryRuleTool, {
      match_type: "akahu_group",
      match_value: "Groceries",
      category_id: diningId,
      backfill: true,
    });
    expect(categoryNameOf(ctx, "t1")).toBe("Kids");
  });

  it("category writes are refused in read-only mode", async () => {
    const ctx = await setup([]);
    putSetting(ctx, "read_only", "true");
    expect(() =>
      invokeTool(ctx, manageCategoriesTool, { action: "create", name: "Nope", kind: "flexible" }),
    ).toThrow(ReadOnlyError);
  });
});

describe("set_category_rule dry_run (Seam 1)", () => {
  const insuranceSplit = [
    sampleTransaction({ id: "a1", amount: -120, group: "Household", merchant: "AIA" }),
    sampleTransaction({ id: "a2", amount: -120, group: "Household", merchant: "AIA" }),
    sampleTransaction({ id: "a3", amount: -40, group: "Lifestyle", merchant: "AIA" }),
    sampleTransaction({ id: "b1", amount: -60, group: "Household", merchant: "Bunnings" }),
  ];

  it("returns the Transactions it would move, grouped by source Budget Category", async () => {
    const ctx = await setup(insuranceSplit);
    const insurance = createCategory(ctx, "Insurance");

    const preview = invokeTool(ctx, setCategoryRuleTool, {
      match_type: "merchant",
      match_value: "AIA",
      category_id: insurance,
      dry_run: true,
    });

    expect(preview).toMatchObject({
      dry_run: true,
      would_reclassify: 3,
      moves: [
        { from_category: "Household", to_category: "Insurance", count: 2 },
        { from_category: "Lifestyle", to_category: "Insurance", count: 1 },
      ],
    });
  });

  it("writes nothing: no rule, no recategorization, no audit row", async () => {
    const ctx = await setup(insuranceSplit);
    const insurance = createCategory(ctx, "Insurance");
    const rulesBefore = ctx.db.select().from(mappingRules).all();
    const auditBefore = ctx.db.select().from(auditLog).all().length;

    invokeTool(ctx, setCategoryRuleTool, {
      match_type: "merchant",
      match_value: "AIA",
      category_id: insurance,
      dry_run: true,
    });

    expect(ctx.db.select().from(mappingRules).all()).toEqual(rulesBefore);
    expect(ctx.db.select().from(auditLog).all()).toHaveLength(auditBefore);
    expect(["a1", "a2", "a3", "b1"].map((id) => categoryNameOf(ctx, id))).toEqual([
      "Household",
      "Household",
      "Lifestyle",
      "Household",
    ]);
  });

  it("previews in read-only mode, because it writes nothing", async () => {
    const ctx = await setup(insuranceSplit);
    const insurance = createCategory(ctx, "Insurance");
    putSetting(ctx, "read_only", "true");

    const preview = invokeTool(ctx, setCategoryRuleTool, {
      match_type: "merchant",
      match_value: "AIA",
      category_id: insurance,
      dry_run: true,
    });
    expect(preview).toMatchObject({ would_reclassify: 3 });
  });

  it("predicts what the same rule reclassifies without dry_run", async () => {
    const ctx = await setup(insuranceSplit);
    const insurance = createCategory(ctx, "Insurance");
    const rule = { match_type: "merchant", match_value: "AIA", category_id: insurance };

    const preview = invokeTool(ctx, setCategoryRuleTool, { ...rule, dry_run: true });
    const applied = invokeTool(ctx, setCategoryRuleTool, rule);

    expect(preview).toMatchObject({ would_reclassify: 3 });
    expect(applied).toEqual({
      match_type: "merchant",
      match_value: "AIA",
      category_id: insurance,
      reclassified: 3,
    });
    expect(categoryNameOf(ctx, "a3")).toBe("Insurance");
  });

  it("previews retargeting an existing rule as a replacement, not an extra rule", async () => {
    const ctx = await setup(insuranceSplit);
    const lifestyle = categoryIdByName(ctx, "Lifestyle");
    const insurance = createCategory(ctx, "Insurance");
    invokeTool(ctx, setCategoryRuleTool, {
      match_type: "merchant",
      match_value: "AIA",
      category_id: lifestyle,
      priority: 5,
    });

    // The stored priority-5 rule would outrank a second AIA rule at priority 0.
    const preview = invokeTool(ctx, setCategoryRuleTool, {
      match_type: "merchant",
      match_value: "AIA",
      category_id: insurance,
      dry_run: true,
    });

    expect(preview).toMatchObject({
      would_reclassify: 3,
      moves: [{ from_category: "Lifestyle", to_category: "Insurance", count: 3 }],
    });
  });

  it("previews no moves when backfill is off", async () => {
    const ctx = await setup(insuranceSplit);
    const insurance = createCategory(ctx, "Insurance");

    const preview = invokeTool(ctx, setCategoryRuleTool, {
      match_type: "merchant",
      match_value: "AIA",
      category_id: insurance,
      backfill: false,
      dry_run: true,
    });
    expect(preview).toMatchObject({ would_reclassify: 0, moves: [] });
  });
});
