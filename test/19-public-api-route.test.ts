import { describe, expect, it } from "vitest";
import type { AppContext } from "../src/context.js";
import { buildTailnetApp } from "../src/http/router.js";
import { runSync } from "../src/sync/index.js";
import { getBudgetTool, setAllocationTool } from "../src/tools/budget.js";
import { listCategoriesTool, manageCategoriesTool } from "../src/tools/categories.js";
import { invokeTool } from "../src/tools/types.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";
import { MEMBER_BEARER, STRANGER_BEARER, getOnce, publicTestApp } from "./http-helpers.js";

// 2026-11-01 01:00 in Auckland (NZDT), but still 31 October in UTC.
const JUST_AFTER_NZ_MIDNIGHT = "2026-10-31T12:00:00.000Z";
const ROUTE = "/api/spending-allowance";

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

describe("Public /api/spending-allowance route (Seam 2)", () => {
  it("returns get_budget's Spending allowance for the local current Period to a Member", async () => {
    const ctx = await seededContext();

    const res = await getOnce(publicTestApp(ctx), ROUTE, { authorization: MEMBER_BEARER });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      spending_allowance: invokeTool(ctx, getBudgetTool, { period: "2026-11" }).spending_allowance,
    });
  });

  it("rejects a request with no token with 401", async () => {
    const ctx = await seededContext();

    const res = await getOnce(publicTestApp(ctx), ROUTE);

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty("spending_allowance");
  });

  it("rejects an invalid token with 401", async () => {
    const ctx = await seededContext();

    const res = await getOnce(publicTestApp(ctx), ROUTE, { authorization: "Bearer forged" });

    expect(res.status).toBe(401);
  });

  it("rejects a token whose email is not attached to a Member with 403", async () => {
    const ctx = await seededContext();

    const res = await getOnce(publicTestApp(ctx), ROUTE, { authorization: STRANGER_BEARER });

    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty("spending_allowance");
  });

  it("is not served on the tailnet listener", async () => {
    const ctx = await seededContext();

    const res = await getOnce(buildTailnetApp(ctx, undefined), ROUTE);

    expect(res.status).toBe(404);
  });
});
