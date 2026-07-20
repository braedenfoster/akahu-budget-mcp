import type { AnyTool } from "./types.js";
import { getSettingsTool, setSettingTool } from "./settings.js";
import { listAccountsTool } from "./accounts.js";

/**
 * Every MCP tool the server exposes. Grows one ticket at a time; the server and
 * the Seam 1 tests both source their tools from here.
 */
export const allTools: AnyTool[] = [
  getSettingsTool,
  setSettingTool,
  listAccountsTool,
];

export function toolByName(name: string): AnyTool | undefined {
  return allTools.find((t) => t.name === name);
}
