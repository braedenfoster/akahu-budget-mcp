import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb, runMigrations } from "../src/db/index.js";
import { getBudgetTool } from "../src/tools/budget.js";
import { evaluatePurchaseTool } from "../src/tools/evaluate.js";
import { listTransactionsTool } from "../src/tools/transactions.js";
import { runSync } from "../src/sync/index.js";
import { invokeTool } from "../src/tools/types.js";
import {
  makeContext,
  putSetting,
  SETTING_BUDGET_MONTH_START_DAY,
  SETTING_HOUSEHOLD_TIMEZONE,
} from "../src/context.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { migrationsBefore, seedConnection, testContext } from "./helpers.js";

// 00:01 on 21 Oct in Auckland; still 20 Oct in UTC.
const JUST_AFTER_NZ_MIDNIGHT_ON_THE_21ST = "2026-10-20T11:01:00.000Z";
// 00:30 on 15 Oct in Auckland (NZDT, UTC+13); still 14 Oct in UTC.
const JUST_AFTER_NZ_MIDNIGHT_ON_THE_15TH = "2026-10-14T11:30:00.000Z";

describe("Household-local dates (Seam 1)", () => {
  it("get_budget with no period resolves the Period from local today", () => {
    const ctx = testContext(JUST_AFTER_NZ_MIDNIGHT_ON_THE_15TH);
    putSetting(ctx, SETTING_BUDGET_MONTH_START_DAY, "15");

    const out = invokeTool(ctx, getBudgetTool, {});

    expect(out.period).toEqual({ key: "2026-10", start: "2026-10-15", end: "2026-11-14" });
    expect(out.spending_allowance.period).toBe("2026-10");
  });

  it("evaluate_purchase counts days_left from local today", () => {
    const ctx = testContext(JUST_AFTER_NZ_MIDNIGHT_ON_THE_21ST);

    const out = invokeTool(ctx, evaluatePurchaseTool, { amount_cents: 1000, period: "2026-10" });

    expect(out.days_left).toBe(11);
  });

  it("the sync stores an Akahu date at NZ midnight as that NZ calendar date", async () => {
    const ctx = testContext("2026-10-17T08:00:00.000Z");
    const connectionId = seedConnection(ctx);
    // Akahu sends 16 Oct as midnight NZDT in UTC.
    const txn = { ...sampleTransaction({ id: "t1", amount: -20 }), date: "2026-10-15T11:00:00.000Z" };
    await runSync(ctx, [{ connectionId, client: new FakeAkahuClient([sampleAccount()], [txn]) }]);

    const out = invokeTool(ctx, listTransactionsTool, {});

    expect(out.transactions.map((t) => t.date)).toEqual(["2026-10-16"]);
  });

  it("the migration moves each stored Transaction to its NZ calendar date", async () => {
    const db = openDb(":memory:");
    const partial = migrationsBefore("0009_local_transaction_dates");
    migrate(db, { migrationsFolder: partial });
    fs.rmSync(partial, { recursive: true });
    const ctx = makeContext(db, () => new Date("2026-10-17T08:00:00.000Z"));
    const connectionId = seedConnection(ctx);
    const midnight = { ...sampleTransaction({ id: "t1", amount: -20 }), date: "2026-10-15T11:00:00.000Z" };
    // 14:19 on 15 Oct in Auckland.
    const daytime = { ...sampleTransaction({ id: "t2", amount: -5 }), date: "2026-10-15T01:19:00.000Z" };
    await runSync(ctx, [
      { connectionId, client: new FakeAkahuClient([sampleAccount()], [midnight, daytime]) },
    ]);
    // The date the sync stored before this migration: Akahu's UTC date, cut.
    db.$client.prepare("UPDATE transactions SET date = '2026-10-15'").run();

    runMigrations(db);

    const out = invokeTool(ctx, listTransactionsTool, {});
    expect(Object.fromEntries(out.transactions.map((t) => [t.id, t.date]))).toEqual({
      t1: "2026-10-16",
      t2: "2026-10-15",
    });
  });

  it("the migration falls back to Pacific/Auckland when household_timezone is invalid", async () => {
    const db = openDb(":memory:");
    const partial = migrationsBefore("0009_local_transaction_dates");
    migrate(db, { migrationsFolder: partial });
    fs.rmSync(partial, { recursive: true });
    const ctx = makeContext(db, () => new Date("2026-10-17T08:00:00.000Z"));
    const connectionId = seedConnection(ctx);
    const txn = { ...sampleTransaction({ id: "t1", amount: -20 }), date: "2026-10-15T11:00:00.000Z" };
    await runSync(ctx, [{ connectionId, client: new FakeAkahuClient([sampleAccount()], [txn]) }]);
    putSetting(ctx, SETTING_HOUSEHOLD_TIMEZONE, "Not/AZone");

    runMigrations(db);

    const out = invokeTool(ctx, listTransactionsTool, {});
    expect(out.transactions.map((t) => t.date)).toEqual(["2026-10-16"]);
  });
});
