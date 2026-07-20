import { describe, expect, it } from "vitest";
import { auditLog } from "../src/db/schema.js";
import { getSettingsTool, setSettingTool } from "../src/tools/settings.js";
import { invokeTool } from "../src/tools/types.js";
import { ReadOnlyError } from "../src/write.js";
import { putSetting } from "../src/context.js";
import { testContext } from "./helpers.js";

describe("ticket 01 — walking skeleton (Seam 1)", () => {
  it("get_settings returns structured data with a data_as_of stamp", () => {
    const ctx = testContext();
    const out = invokeTool(ctx, getSettingsTool, {});
    expect(out).toEqual({ settings: {}, data_as_of: null });
  });

  it("set_setting persists a value through the write path and reads back", () => {
    const ctx = testContext();
    const written = invokeTool(ctx, setSettingTool, {
      key: "budget_month_start_day",
      value: "15",
    });
    expect(written).toEqual({
      key: "budget_month_start_day",
      value: "15",
      data_as_of: null,
    });

    const read = invokeTool(ctx, getSettingsTool, {});
    expect(read.settings).toEqual({ budget_month_start_day: "15" });
  });

  it("every write appends exactly one audit_log row", () => {
    const ctx = testContext();
    invokeTool(ctx, setSettingTool, { key: "foo", value: "bar" });

    const rows = ctx.db.select().from(auditLog).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tool: "set_setting", summary: "set foo = bar" });
    expect(rows[0]!.ts).toBe("2026-07-15T09:00:00.000Z");
  });

  it("read_only blocks the write and logs nothing", () => {
    const ctx = testContext();
    // Enter read-only mode operationally (bypassing the write wrapper).
    putSetting(ctx, "read_only", "true");

    expect(() => invokeTool(ctx, setSettingTool, { key: "foo", value: "bar" })).toThrow(
      ReadOnlyError,
    );

    // The blocked write left no trace: no audit row, no persisted value.
    expect(ctx.db.select().from(auditLog).all()).toHaveLength(0);
    const read = invokeTool(ctx, getSettingsTool, {});
    expect(read.settings.foo).toBeUndefined();
  });
});
