import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { putSetting, SETTING_LAST_SYNC_AT, type AppContext } from "../src/context.js";
import { runSync } from "../src/sync/index.js";
import { manageBillsTool } from "../src/tools/bills.js";
import { setAllocationTool } from "../src/tools/budget.js";
import { listCategoriesTool, manageCategoriesTool } from "../src/tools/categories.js";
import { invokeTool } from "../src/tools/types.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";
import { MEMBER_BEARER, getOnce, publicTestApp } from "./http-helpers.js";

const CONTRACTS_DIR = path.resolve(import.meta.dirname, "../contracts");
const UPDATE = process.env.UPDATE_CONTRACTS === "1";

// 2026-10-15 21:00 in Auckland (NZDT), a Thursday.
const MID_OCTOBER = "2026-10-15T08:00:00.000Z";

const MONTHLY_BILL = { action: "create", cadence: "monthly", match_type: "merchant" } as const;

/** One Bill occurrence in each week-list state on 15 Oct. */
const WEEK_OF_BILLS = [
  { ...MONTHLY_BILL, name: "Power", day_of_month: 12, expected_amount_cents: 21200, match_value: "Contact Energy" },
  { ...MONTHLY_BILL, name: "Spotify", day_of_month: 13, expected_amount_cents: 2599, match_value: "Spotify" },
  { ...MONTHLY_BILL, name: "Internet", day_of_month: 14, expected_amount_cents: 8999, match_value: "2degrees" },
  {
    ...MONTHLY_BILL,
    name: "Water",
    day_of_month: 20,
    amount_mode: "estimated",
    expected_amount_cents: 8000,
    match_value: "Watercare",
  },
];

async function seeded(foodSpentDollars: number, allocateFood: boolean, billInputs = WEEK_OF_BILLS): Promise<AppContext> {
  const ctx = testContext(MID_OCTOBER);
  const connectionId = seedConnection(ctx);
  const client = new FakeAkahuClient(
    [sampleAccount()],
    [
      sampleTransaction({ id: "f1", date: "2026-10-03", amount: -foodSpentDollars, group: "Food" }),
      sampleTransaction({ id: "x1", date: "2026-10-04", amount: -15, description: "MYSTERY SHOP" }),
      sampleTransaction({ id: "s1", date: "2026-10-13", amount: -26.49, merchant: "Spotify", group: "Subscriptions" }),
    ],
  );
  await runSync(ctx, [{ connectionId, client }]);
  const categories = invokeTool(ctx, listCategoriesTool, {}).categories;
  const food = categories.find((c) => c.name === "Food")!;
  invokeTool(ctx, manageCategoriesTool, { action: "set_kind", id: food.id, kind: "flexible" });
  if (allocateFood) {
    invokeTool(ctx, setAllocationTool, { period: "2026-10", category_id: food.id, amount_cents: 50000 });
    // Covers the paid Bill's debit, so the Bills leave the Spending allowance as it was.
    const subscriptions = categories.find((c) => c.name === "Subscriptions")!;
    invokeTool(ctx, setAllocationTool, { period: "2026-10", category_id: subscriptions.id, amount_cents: 2649 });
  }
  for (const bill of billInputs) invokeTool(ctx, manageBillsTool, bill);
  return ctx;
}

const STATES: Record<string, () => Promise<AppContext>> = {
  ok: () => seeded(120, true),
  over: () => seeded(600, true),
  no_budget: () => seeded(120, false),
  stale: async () => {
    const ctx = await seeded(120, true);
    putSetting(ctx, SETTING_LAST_SYNC_AT, "2026-10-13T08:00:00.000Z");
    return ctx;
  },
  no_bills_today: () => seeded(120, true, WEEK_OF_BILLS.filter((b) => b.name === "Water")),
};

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

describe("contracts/spending-allowance.<state>.json", () => {
  for (const [state, setup] of Object.entries(STATES)) {
    it(`matches the ${state} response from the public route`, async () => {
      const ctx = await setup();
      const res = await getOnce(publicTestApp(ctx), "/api/spending-allowance", {
        authorization: MEMBER_BEARER,
      });
      expect(res.status).toBe(200);

      const generated = `${JSON.stringify(sortKeys(res.body), null, 2)}\n`;
      const file = path.join(CONTRACTS_DIR, `spending-allowance.${state}.json`);
      if (UPDATE) {
        fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
        fs.writeFileSync(file, generated);
      }
      expect(fs.existsSync(file), `${file} is missing; run UPDATE_CONTRACTS=1 pnpm test`).toBe(true);
      expect(generated, "regenerate with UPDATE_CONTRACTS=1 pnpm test").toBe(fs.readFileSync(file, "utf8"));
    });
  }

  const contract = (state: string) =>
    JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, `spending-allowance.${state}.json`), "utf8")) as {
      spending_allowance: {
        status: string;
        stale: boolean;
        flexible_allocated_cents: number | null;
        period_days: number;
      };
      bills: {
        occurrences: { name: string; state: string; amount_display: string }[];
        today: unknown[];
        next_upcoming: { name: string } | null;
        due_total_display: string;
        stale: boolean;
      };
    };

  it("generates one file per allowance state", () => {
    const sa = (state: string) => contract(state).spending_allowance;
    expect(sa("ok")).toMatchObject({ status: "ok", stale: false, flexible_allocated_cents: 50000 });
    expect(sa("over")).toMatchObject({ status: "over", stale: false, flexible_allocated_cents: 50000 });
    expect(sa("no_budget")).toMatchObject({ status: "no_budget", stale: false, flexible_allocated_cents: null });
    expect(sa("stale")).toMatchObject({ status: "ok", stale: true, flexible_allocated_cents: 50000 });
    for (const state of Object.keys(STATES)) expect(sa(state).period_days).toBe(31);
  });

  it("carries a Bills view with an overdue, paid, due and upcoming row, in the no-Budget state too", () => {
    for (const state of ["ok", "over", "no_budget", "stale"]) {
      expect(contract(state).bills.occurrences, state).toEqual([
        expect.objectContaining({ name: "Power", state: "overdue", amount_display: "$212.00" }),
        expect.objectContaining({ name: "Spotify", state: "paid", amount_display: "$26.49" }),
        expect.objectContaining({ name: "Internet", state: "due", amount_display: "$89.99" }),
        expect.objectContaining({ name: "Water", state: "upcoming", amount_display: "~$80.00" }),
      ]);
      expect(contract(state).bills.due_total_display, state).toBe("$381.99");
    }
    expect(contract("stale").bills.stale).toBe(true);
  });

  it("has a fixture with no Bills today and a next upcoming Bill", () => {
    const { bills } = contract("no_bills_today");

    expect(bills.today).toEqual([]);
    expect(bills.next_upcoming).toMatchObject({ name: "Water" });
  });
});
