import { describe, expect, it } from "vitest";
import { runSync } from "../src/sync/index.js";
import { getBudgetTool, setAllocationTool } from "../src/tools/budget.js";
import { listCategoriesTool, manageCategoriesTool } from "../src/tools/categories.js";
import { addPlannedPurchaseTool } from "../src/tools/planned.js";
import { invokeTool } from "../src/tools/types.js";
import {
  putSetting,
  SETTING_HOUSEHOLD_TIMEZONE,
  SETTING_LAST_SYNC_AT,
  type AppContext,
} from "../src/context.js";
import type { CategoryKind } from "../src/db/schema.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";

// 2026-10-15 21:00 in Auckland (NZDT, UTC+13).
const MID_OCTOBER = "2026-10-15T08:00:00.000Z";

async function setup(
  txns: ReturnType<typeof sampleTransaction>[],
  now = MID_OCTOBER,
): Promise<AppContext> {
  const ctx = testContext(now);
  const connectionId = seedConnection(ctx);
  const client = new FakeAkahuClient([sampleAccount()], txns);
  await runSync(ctx, [{ connectionId, client }]);
  return ctx;
}

function categoryId(ctx: AppContext, name: string): number {
  const out = invokeTool(ctx, listCategoriesTool, {});
  return out.categories.find((c) => c.name === name)!.id;
}

function setKind(ctx: AppContext, name: string, kind: CategoryKind): void {
  invokeTool(ctx, manageCategoriesTool, { action: "set_kind", id: categoryId(ctx, name), kind });
}

function allocate(ctx: AppContext, name: string, cents: number, period = "2026-10"): void {
  invokeTool(ctx, setAllocationTool, { period, category_id: categoryId(ctx, name), amount_cents: cents });
}

function allowance(ctx: AppContext, period = "2026-10") {
  return invokeTool(ctx, getBudgetTool, { period }).spending_allowance;
}

describe("Spending allowance on get_budget (Seam 1)", () => {
  it("pools flexible Envelopes without clamping an overspent one", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "f1", date: "2026-10-03", amount: -120, group: "Food" }),
      sampleTransaction({ id: "l1", date: "2026-10-05", amount: -250, group: "Lifestyle" }),
    ]);
    setKind(ctx, "Food", "flexible");
    setKind(ctx, "Lifestyle", "flexible");
    allocate(ctx, "Food", 50000);
    allocate(ctx, "Lifestyle", 20000);

    expect(allowance(ctx)).toMatchObject({
      period: "2026-10",
      status: "ok",
      amount_cents: 33000,
      flexible_remaining_cents: 33000,
      committed_overspend_cents: 0,
      uncategorized_spent_cents: 0,
      uncategorized_count: 0,
    });
  });

  it("adds nothing for committed underspend and subtracts committed overspend", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "f1", date: "2026-10-03", amount: -100, group: "Food" }),
      sampleTransaction({ id: "h1", date: "2026-10-01", amount: -2000, group: "Housing" }),
      sampleTransaction({ id: "u1", date: "2026-10-09", amount: -260, group: "Utilities" }),
    ]);
    setKind(ctx, "Food", "flexible");
    allocate(ctx, "Food", 50000);
    allocate(ctx, "Housing", 250000);
    allocate(ctx, "Utilities", 20000);

    expect(allowance(ctx)).toMatchObject({
      status: "ok",
      amount_cents: 34000,
      flexible_remaining_cents: 40000,
      committed_overspend_cents: 6000,
    });
  });

  it("subtracts Uncategorized spend and counts its Transactions", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "f1", date: "2026-10-03", amount: -100, group: "Food" }),
      sampleTransaction({ id: "x1", date: "2026-10-04", amount: -45.5, description: "MYSTERY SHOP" }),
      sampleTransaction({ id: "x2", date: "2026-10-06", amount: -12, description: "CORNER DAIRY" }),
      sampleTransaction({ id: "x3", date: "2026-09-28", amount: -99, description: "LAST MONTH" }),
    ]);
    setKind(ctx, "Food", "flexible");
    allocate(ctx, "Food", 50000);

    expect(allowance(ctx)).toMatchObject({
      status: "ok",
      amount_cents: 34250,
      flexible_remaining_cents: 40000,
      uncategorized_spent_cents: 5750,
      uncategorized_count: 2,
    });
  });

  it("ignores TRANSFER rows, Income, and Planned Purchases", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "f1", date: "2026-10-03", amount: -100, group: "Food" }),
      sampleTransaction({ id: "pay", date: "2026-10-01", amount: 4000, description: "Payroll" }),
      sampleTransaction({ id: "sv", date: "2026-10-02", amount: -500, type: "TRANSFER", description: "To savings" }),
      sampleTransaction({ id: "fx", date: "2026-10-02", amount: -80, type: "TRANSFER", group: "Food" }),
    ]);
    setKind(ctx, "Food", "flexible");
    allocate(ctx, "Food", 50000);
    invokeTool(ctx, addPlannedPurchaseTool, {
      description: "Heat pump",
      amount_cents: 300000,
      target_category_id: categoryId(ctx, "Food"),
      target_period: "2026-10",
    });

    expect(allowance(ctx)).toMatchObject({
      status: "ok",
      amount_cents: 40000,
      flexible_remaining_cents: 40000,
      committed_overspend_cents: 0,
      uncategorized_spent_cents: 0,
      uncategorized_count: 0,
    });
  });

  it("reports over when the amount is negative", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "f1", date: "2026-10-03", amount: -600, group: "Food" }),
    ]);
    setKind(ctx, "Food", "flexible");
    allocate(ctx, "Food", 50000);

    expect(allowance(ctx)).toMatchObject({ status: "over", amount_cents: -10000, per_week_cents: null });
  });

  it("reports no_budget without inventing a figure, and the read creates no Budget", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "f1", date: "2026-10-03", amount: -100, group: "Food" }),
      sampleTransaction({ id: "x1", date: "2026-10-04", amount: -20, description: "MYSTERY SHOP" }),
    ]);
    setKind(ctx, "Food", "flexible");

    expect(allowance(ctx)).toMatchObject({
      period: "2026-10",
      status: "no_budget",
      amount_cents: null,
      per_week_cents: null,
      flexible_remaining_cents: null,
      committed_overspend_cents: null,
      uncategorized_spent_cents: null,
      uncategorized_count: 1,
    });
    expect(invokeTool(ctx, getBudgetTool, { period: "2026-10" }).has_budget).toBe(false);
  });

  describe("days_left and per_week", () => {
    async function flexibleBudget(now: string, spentDollars = 100): Promise<AppContext> {
      const ctx = await setup(
        [sampleTransaction({ id: "f1", date: "2026-10-03", amount: -spentDollars, group: "Food" })],
        now,
      );
      setKind(ctx, "Food", "flexible");
      allocate(ctx, "Food", 50000);
      return ctx;
    }

    it("counts today in NZ local time, just before and just after local midnight", async () => {
      // 23:59 on 20 Oct in Auckland; still 20 Oct in UTC.
      const before = await flexibleBudget("2026-10-20T10:59:00.000Z");
      expect(allowance(before)).toMatchObject({ days_left: 12, per_week_cents: 23333 });

      // 00:01 on 21 Oct in Auckland; still 20 Oct in UTC.
      const after = await flexibleBudget("2026-10-20T11:01:00.000Z");
      expect(allowance(after)).toMatchObject({ days_left: 11, per_week_cents: 25454 });
    });

    it("uses the household_timezone setting when it is set", async () => {
      const ctx = await flexibleBudget("2026-10-20T11:01:00.000Z");
      putSetting(ctx, SETTING_HOUSEHOLD_TIMEZONE, "UTC");
      expect(allowance(ctx).days_left).toBe(12);
    });

    it("shows the full amount per week when 7 or fewer days are left", async () => {
      // 23:00 on 25 Oct in Auckland.
      const ctx = await flexibleBudget("2026-10-25T10:00:00.000Z");
      expect(allowance(ctx)).toMatchObject({ days_left: 7, amount_cents: 40000, per_week_cents: 40000 });
    });

    it("has no per_week when the Period has ended in local time", async () => {
      // 00:30 on 1 Nov in Auckland; still 31 Oct in UTC.
      const ctx = await flexibleBudget("2026-10-31T11:30:00.000Z");
      expect(allowance(ctx)).toMatchObject({ status: "ok", days_left: 0, per_week_cents: null });
    });

    it("has no per_week when the amount is negative", async () => {
      const ctx = await flexibleBudget(MID_OCTOBER, 600);
      expect(allowance(ctx)).toMatchObject({ status: "over", days_left: 17, per_week_cents: null });
    });

    it("clamps days_left to the Period length for a future Period", async () => {
      const ctx = await flexibleBudget(MID_OCTOBER);
      expect(allowance(ctx, "2026-11").days_left).toBe(30);
    });
  });

  describe("stale", () => {
    const hoursBefore = (hours: number) =>
      new Date(new Date(MID_OCTOBER).getTime() - hours * 60 * 60 * 1000).toISOString();

    it("carries Data-as-of and is fresh straight after a sync", async () => {
      const ctx = await setup([]);
      expect(allowance(ctx)).toMatchObject({ data_as_of: MID_OCTOBER, stale: false });
    });

    it("is fresh up to 36 hours and stale after", async () => {
      const ctx = await setup([]);
      putSetting(ctx, SETTING_LAST_SYNC_AT, hoursBefore(35));
      expect(allowance(ctx)).toMatchObject({ data_as_of: hoursBefore(35), stale: false });

      putSetting(ctx, SETTING_LAST_SYNC_AT, hoursBefore(36));
      expect(allowance(ctx).stale).toBe(false);

      putSetting(ctx, SETTING_LAST_SYNC_AT, hoursBefore(37));
      expect(allowance(ctx)).toMatchObject({ data_as_of: hoursBefore(37), stale: true });
    });

    it("is stale when Data-as-of cannot be read", async () => {
      const ctx = await setup([]);
      putSetting(ctx, SETTING_LAST_SYNC_AT, "not a date");
      expect(allowance(ctx).stale).toBe(true);
    });

    it("is stale when there has never been a sync", () => {
      const ctx = testContext(MID_OCTOBER);
      expect(allowance(ctx)).toMatchObject({ data_as_of: null, stale: true });
    });
  });

  it("counts flexible spend with no allocation as allocated 0", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "f1", date: "2026-10-03", amount: -100, group: "Food" }),
      sampleTransaction({ id: "a1", date: "2026-10-07", amount: -80, group: "Appearance" }),
    ]);
    setKind(ctx, "Food", "flexible");
    setKind(ctx, "Appearance", "flexible");
    allocate(ctx, "Food", 50000);

    expect(allowance(ctx)).toMatchObject({ amount_cents: 32000, flexible_remaining_cents: 32000 });
  });

  it("set_kind changes the allowance", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "f1", date: "2026-10-03", amount: -100, group: "Food" }),
    ]);
    allocate(ctx, "Food", 50000);
    expect(allowance(ctx).amount_cents).toBe(0);

    setKind(ctx, "Food", "flexible");
    expect(allowance(ctx).amount_cents).toBe(40000);
  });

  it("get_budget keeps resolving its default Period in UTC", async () => {
    // 00:30 on 1 Nov in Auckland; still 31 Oct in UTC.
    const ctx = await setup([], "2026-10-31T11:30:00.000Z");
    const budget = invokeTool(ctx, getBudgetTool, {});
    expect(budget.period.key).toBe("2026-10");
    expect(budget.spending_allowance).toMatchObject({ period: "2026-10", days_left: 0 });
  });
});

describe("Committed and Flexible allocated totals on get_budget (Seam 1)", () => {
  it("totals allocations by kind and leaves Uncategorized out of both", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "f1", date: "2026-10-03", amount: -120, group: "Food" }),
      sampleTransaction({ id: "h1", date: "2026-10-01", amount: -2000, group: "Housing" }),
      sampleTransaction({ id: "x1", date: "2026-10-04", amount: -30, description: "MYSTERY" }),
    ]);
    setKind(ctx, "Food", "flexible");
    allocate(ctx, "Food", 50000);
    allocate(ctx, "Housing", 250000);
    allocate(ctx, "Uncategorized", 1000);

    expect(invokeTool(ctx, getBudgetTool, { period: "2026-10" }).allocated_by_kind).toEqual({
      committed_cents: 250000,
      flexible_cents: 50000,
    });
  });
});
