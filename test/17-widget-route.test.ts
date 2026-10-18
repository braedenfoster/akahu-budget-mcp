import { describe, expect, it } from "vitest";
import type { AppContext } from "../src/context.js";
import { buildPublicApp, buildTailnetApp } from "../src/http/router.js";
import { runSync } from "../src/sync/index.js";
import { getBudgetTool, setAllocationTool } from "../src/tools/budget.js";
import { listCategoriesTool, manageCategoriesTool } from "../src/tools/categories.js";
import { invokeTool } from "../src/tools/types.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";
import { TEST_AUTH, getOnce } from "./http-helpers.js";

// 2026-11-01 01:00 in Auckland (NZDT), but still 31 October in UTC.
const JUST_AFTER_NZ_MIDNIGHT = "2026-10-31T12:00:00.000Z";

async function seededContext(): Promise<AppContext> {
  const ctx = testContext(JUST_AFTER_NZ_MIDNIGHT);
  const connectionId = seedConnection(ctx);
  const client = new FakeAkahuClient(
    [sampleAccount()],
    [
      sampleTransaction({ id: "f1", date: "2026-11-01", amount: -40, group: "Food" }),
      sampleTransaction({ id: "x1", date: "2026-11-01", amount: -15 }),
    ],
  );
  await runSync(ctx, [{ connectionId, client }]);
  const food = invokeTool(ctx, listCategoriesTool, {}).categories.find((c) => c.name === "Food")!;
  invokeTool(ctx, manageCategoriesTool, { action: "set_kind", id: food.id, kind: "flexible" });
  invokeTool(ctx, setAllocationTool, { period: "2026-11", category_id: food.id, amount_cents: 60000 });
  return ctx;
}

describe("Widget JSON route (Seam 2)", () => {
  it("serves get_budget's Spending allowance for the local current Period on the tailnet listener", async () => {
    const ctx = await seededContext();

    const res = await getOnce(buildTailnetApp(ctx, undefined), "/widget/summary");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      spending_allowance: invokeTool(ctx, getBudgetTool, { period: "2026-11" }).spending_allowance,
    });
  });

  it("is not served on the public listener, even to an authenticated caller", async () => {
    const ctx = await seededContext();
    const app = buildPublicApp(ctx, {
      authorize: async () => ({ ok: true, actor: { memberId: 1, source: "oauth" } }),
      auth: TEST_AUTH,
    });

    const res = await getOnce(app, "/widget/summary", { authorization: "Bearer any" });

    expect(res.status).toBe(404);
  });
});
