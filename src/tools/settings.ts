import { z } from "zod";
import { getDataAsOf, getSetting, putSetting } from "../context.js";
import { settings } from "../db/schema.js";
import { withWrite } from "../write.js";
import { defineTool } from "./types.js";

/**
 * Read all settings for the Household, with the standard `data_as_of` stamp
 * that every read carries (ADR-0005). Demonstrates the read path (ticket 01).
 */
export const getSettingsTool = defineTool({
  name: "get_settings",
  description:
    "Return the Household's server settings (read-only mode, budget month start day, etc.) with a data-as-of freshness stamp.",
  inputSchema: {},
  handler: (ctx) => {
    const rows = ctx.db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .all();
    const asObject: Record<string, string> = {};
    for (const r of rows) asObject[r.key] = r.value;
    return { settings: asObject, data_as_of: getDataAsOf(ctx) };
  },
});

/**
 * Set a single setting. Demonstrates the write path (ticket 01): it flows
 * through the shared write wrapper, so it is audited and refused in read-only
 * mode.
 */
export const setSettingTool = defineTool({
  name: "set_setting",
  description:
    "Set a single Household setting. Audited; refused when the server is in read-only mode.",
  inputSchema: {
    key: z.string().min(1).describe("Setting key, e.g. budget_month_start_day"),
    value: z.string().describe("Setting value as a string"),
  },
  handler: (ctx, input) =>
    withWrite(
      ctx,
      {
        tool: "set_setting",
        summary: `set ${input.key} = ${input.value}`,
        payload: { key: input.key, value: input.value, previous: getSetting(ctx, input.key) ?? null },
      },
      () => {
        putSetting(ctx, input.key, input.value);
        return { key: input.key, value: input.value, data_as_of: getDataAsOf(ctx) };
      },
    ),
});
