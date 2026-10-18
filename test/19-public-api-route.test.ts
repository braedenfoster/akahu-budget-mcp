import { describe, expect, it } from "vitest";
import { buildTailnetApp } from "../src/http/router.js";
import { getBudgetTool } from "../src/tools/budget.js";
import { invokeTool } from "../src/tools/types.js";
import { MEMBER_BEARER, STRANGER_BEARER, getOnce, publicTestApp, seededContext } from "./http-helpers.js";

const ROUTE = "/api/spending-allowance";

describe("Public /api/spending-allowance route", () => {
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
