import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb, runMigrations } from "../src/db/index.js";
import { runCategorization } from "../src/categorization/engine.js";
import { syncAccounts } from "../src/sync/accounts.js";
import { syncTransactions } from "../src/sync/transactions.js";
import { listCategoriesTool, manageCategoriesTool } from "../src/tools/categories.js";
import { invokeTool } from "../src/tools/types.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";
import { makeContext, putSetting, type AppContext } from "../src/context.js";
import { auditLog, type CategoryKind } from "../src/db/schema.js";
import { ReadOnlyError } from "../src/write.js";

async function setup(txns: ReturnType<typeof sampleTransaction>[]): Promise<AppContext> {
  const ctx = testContext();
  const connectionId = seedConnection(ctx);
  const client = new FakeAkahuClient([sampleAccount()], txns);
  await syncAccounts(ctx, [{ connectionId, client }]);
  await syncTransactions(ctx, [{ connectionId, client }]);
  runCategorization(ctx);
  return ctx;
}

/** A copy of the migrations folder that stops just before the given tag. */
function migrationsBefore(tag: string): string {
  const source = path.resolve(import.meta.dirname, "../drizzle");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"));
  const journal = JSON.parse(fs.readFileSync(path.join(source, "meta/_journal.json"), "utf8"));
  const cut = journal.entries.findIndex((e: { tag: string }) => e.tag === tag);
  journal.entries = journal.entries.slice(0, cut);
  fs.mkdirSync(path.join(dir, "meta"));
  fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify(journal));
  for (const e of journal.entries) {
    fs.copyFileSync(path.join(source, `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`));
  }
  return dir;
}

function categoryId(ctx: AppContext, name: string): number {
  const out = invokeTool(ctx, listCategoriesTool, {});
  return out.categories.find((c) => c.name === name)!.id;
}

function kindsByName(ctx: AppContext): Record<string, CategoryKind> {
  const out = invokeTool(ctx, listCategoriesTool, {});
  return Object.fromEntries(out.categories.map((c) => [c.name, c.kind]));
}

describe("Committed/Flexible flag on Budget Categories (Seam 1)", () => {
  it("list_categories returns each category's kind; seeded categories are committed", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "t1", amount: -25, group: "Groceries" }),
    ]);
    expect(kindsByName(ctx)).toEqual({ Uncategorized: "committed", Groceries: "committed" });
  });

  it("the migration marks every existing category, including Uncategorized, committed", () => {
    const db = openDb(":memory:");
    const partial = migrationsBefore("0008_heavy_sleeper");
    migrate(db, { migrationsFolder: partial });
    fs.rmSync(partial, { recursive: true });
    db.$client
      .prepare("INSERT INTO budget_categories (name, is_system, created_at) VALUES (?, ?, ?)")
      .run("Uncategorized", 1, "2026-01-01T00:00:00.000Z");
    db.$client
      .prepare("INSERT INTO budget_categories (name, is_system, created_at) VALUES (?, ?, ?)")
      .run("Food", 0, "2026-01-01T00:00:00.000Z");

    runMigrations(db);

    const ctx = makeContext(db, () => new Date("2026-07-15T09:00:00.000Z"));
    expect(kindsByName(ctx)).toEqual({ Uncategorized: "committed", Food: "committed" });
  });

  it("create refuses a request without kind", async () => {
    const ctx = await setup([]);
    expect(() => invokeTool(ctx, manageCategoriesTool, { action: "create", name: "Food" })).toThrow(
      /kind/,
    );
    expect(kindsByName(ctx)).not.toHaveProperty("Food");
  });

  it("create accepts committed or flexible", async () => {
    const ctx = await setup([]);
    const food = invokeTool(ctx, manageCategoriesTool, {
      action: "create",
      name: "Food",
      kind: "flexible",
    });
    expect(food).toMatchObject({ name: "Food", kind: "flexible" });
    invokeTool(ctx, manageCategoriesTool, { action: "create", name: "Insurance", kind: "committed" });
    expect(kindsByName(ctx)).toMatchObject({ Food: "flexible", Insurance: "committed" });
  });

  it("create on an existing name with a different kind is refused and points to set_kind", async () => {
    const ctx = await setup([sampleTransaction({ id: "t1", amount: -25, group: "Groceries" })]);
    expect(() =>
      invokeTool(ctx, manageCategoriesTool, { action: "create", name: "Groceries", kind: "flexible" }),
    ).toThrow(/set_kind/);
    expect(kindsByName(ctx).Groceries).toBe("committed");
    expect(ctx.db.select().from(auditLog).all()).toHaveLength(0);

    const same = invokeTool(ctx, manageCategoriesTool, {
      action: "create",
      name: "Groceries",
      kind: "committed",
    });
    expect(same).toMatchObject({ id: categoryId(ctx, "Groceries"), kind: "committed" });
  });

  it("set_kind changes a category's kind", async () => {
    const ctx = await setup([sampleTransaction({ id: "t1", amount: -25, group: "Groceries" })]);
    const groceries = categoryId(ctx, "Groceries");
    const out = invokeTool(ctx, manageCategoriesTool, {
      action: "set_kind",
      id: groceries,
      kind: "flexible",
    });
    expect(out).toMatchObject({ id: groceries, kind: "flexible" });
    expect(kindsByName(ctx).Groceries).toBe("flexible");

    invokeTool(ctx, manageCategoriesTool, { action: "set_kind", id: groceries, kind: "committed" });
    expect(kindsByName(ctx).Groceries).toBe("committed");
  });

  it("set_kind requires an existing id and a kind", async () => {
    const ctx = await setup([sampleTransaction({ id: "t1", amount: -25, group: "Groceries" })]);
    expect(() =>
      invokeTool(ctx, manageCategoriesTool, { action: "set_kind", id: 9999, kind: "flexible" }),
    ).toThrow(/No category/);
    expect(() =>
      invokeTool(ctx, manageCategoriesTool, { action: "set_kind", id: categoryId(ctx, "Groceries") }),
    ).toThrow(/kind/);
  });

  it("set_kind on the Uncategorized system category is refused", async () => {
    const ctx = await setup([]);
    expect(() =>
      invokeTool(ctx, manageCategoriesTool, {
        action: "set_kind",
        id: categoryId(ctx, "Uncategorized"),
        kind: "flexible",
      }),
    ).toThrow(/Uncategorized/);
    expect(kindsByName(ctx).Uncategorized).toBe("committed");
  });

  it("merge keeps the target's kind", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "t1", amount: -25, group: "Groceries" }),
      sampleTransaction({ id: "t2", amount: -30, group: "Supermarket" }),
    ]);
    const supermarket = categoryId(ctx, "Supermarket");
    invokeTool(ctx, manageCategoriesTool, { action: "set_kind", id: supermarket, kind: "flexible" });

    invokeTool(ctx, manageCategoriesTool, {
      action: "merge",
      source_id: supermarket,
      target_id: categoryId(ctx, "Groceries"),
    });
    expect(kindsByName(ctx)).toEqual({ Uncategorized: "committed", Groceries: "committed" });
  });

  it("create and set_kind each append one audit_log row", async () => {
    const ctx = await setup([]);
    invokeTool(ctx, manageCategoriesTool, { action: "create", name: "Food", kind: "committed" });
    const food = categoryId(ctx, "Food");
    invokeTool(ctx, manageCategoriesTool, { action: "set_kind", id: food, kind: "flexible" });

    const rows = ctx.db.select().from(auditLog).all();
    expect(rows.map((r) => [r.tool, JSON.parse(r.payload!)])).toEqual([
      ["manage_categories", { name: "Food", kind: "committed" }],
      ["manage_categories", { id: food, kind: "flexible" }],
    ]);
  });

  it("create and set_kind are refused in read-only mode", async () => {
    const ctx = await setup([sampleTransaction({ id: "t1", amount: -25, group: "Groceries" })]);
    putSetting(ctx, "read_only", "true");
    expect(() =>
      invokeTool(ctx, manageCategoriesTool, { action: "create", name: "Food", kind: "flexible" }),
    ).toThrow(ReadOnlyError);
    expect(() =>
      invokeTool(ctx, manageCategoriesTool, {
        action: "set_kind",
        id: categoryId(ctx, "Groceries"),
        kind: "flexible",
      }),
    ).toThrow(ReadOnlyError);
    expect(kindsByName(ctx)).toEqual({ Uncategorized: "committed", Groceries: "committed" });
    expect(ctx.db.select().from(auditLog).all()).toHaveLength(0);
  });
});
