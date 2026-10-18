import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { putSetting, SETTING_LAST_SYNC_AT, type AppContext } from "../src/context.js";
import { runSync } from "../src/sync/index.js";
import { setAllocationTool } from "../src/tools/budget.js";
import { listCategoriesTool, manageCategoriesTool } from "../src/tools/categories.js";
import { invokeTool } from "../src/tools/types.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";
import { MEMBER_BEARER, getOnce, publicTestApp } from "./http-helpers.js";

const CONTRACTS_DIR = path.resolve(import.meta.dirname, "../contracts");
const UPDATE = process.env.UPDATE_CONTRACTS === "1";

// 2026-10-15 21:00 in Auckland (NZDT): 17 days left in October.
const MID_OCTOBER = "2026-10-15T08:00:00.000Z";

async function seeded(foodSpentDollars: number, allocateFood: boolean): Promise<AppContext> {
  const ctx = testContext(MID_OCTOBER);
  const connectionId = seedConnection(ctx);
  const client = new FakeAkahuClient(
    [sampleAccount()],
    [
      sampleTransaction({ id: "f1", date: "2026-10-03", amount: -foodSpentDollars, group: "Food" }),
      sampleTransaction({ id: "x1", date: "2026-10-04", amount: -15, description: "MYSTERY SHOP" }),
    ],
  );
  await runSync(ctx, [{ connectionId, client }]);
  const food = invokeTool(ctx, listCategoriesTool, {}).categories.find((c) => c.name === "Food")!;
  invokeTool(ctx, manageCategoriesTool, { action: "set_kind", id: food.id, kind: "flexible" });
  if (allocateFood) {
    invokeTool(ctx, setAllocationTool, { period: "2026-10", category_id: food.id, amount_cents: 50000 });
  }
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

  it("generates one file per allowance state", () => {
    const sa = (state: string) =>
      (JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, `spending-allowance.${state}.json`), "utf8")) as {
        spending_allowance: { status: string; stale: boolean };
      }).spending_allowance;
    expect(sa("ok")).toMatchObject({ status: "ok", stale: false });
    expect(sa("over")).toMatchObject({ status: "over", stale: false });
    expect(sa("no_budget")).toMatchObject({ status: "no_budget", stale: false });
    expect(sa("stale")).toMatchObject({ status: "ok", stale: true });
  });
});
