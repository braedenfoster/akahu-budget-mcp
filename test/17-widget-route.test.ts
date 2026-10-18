import { describe, expect, it } from "vitest";
import { buildPublicApp, buildTailnetApp } from "../src/http/router.js";
import { getBudgetTool } from "../src/tools/budget.js";
import { invokeTool } from "../src/tools/types.js";
import { TEST_AUTH, getOnce, seededContext } from "./http-helpers.js";

describe("Widget JSON route", () => {
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
