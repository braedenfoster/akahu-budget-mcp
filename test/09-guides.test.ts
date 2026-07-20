import { describe, expect, it } from "vitest";
import { WORKFLOW_FLOWS } from "../src/guides/guides.js";
import { getWorkflowGuideTool } from "../src/tools/guides.js";
import { invokeTool } from "../src/tools/types.js";
import { testContext } from "./helpers.js";

describe("ticket 09 — get_workflow_guide (Seam 1)", () => {
  it("returns a guide for each of the four flows", () => {
    const ctx = testContext();
    for (const flow of WORKFLOW_FLOWS) {
      const guide = invokeTool(ctx, getWorkflowGuideTool, { flow });
      expect(guide.flow).toBe(flow);
      expect(guide.steps.length).toBeGreaterThan(0);
      expect(guide.tools.length).toBeGreaterThan(0);
    }
  });

  it("names real, registered tools in every guide", async () => {
    const { allTools } = await import("../src/tools/registry.js");
    const toolNames = new Set(allTools.map((t) => t.name));
    const ctx = testContext();
    for (const flow of WORKFLOW_FLOWS) {
      const guide = invokeTool(ctx, getWorkflowGuideTool, { flow });
      for (const tool of guide.tools) {
        expect(toolNames.has(tool), `${flow} references unknown tool ${tool}`).toBe(true);
      }
    }
  });

  it("errors cleanly on an unknown flow", () => {
    const ctx = testContext();
    expect(() => invokeTool(ctx, getWorkflowGuideTool, { flow: "nope" })).toThrow(
      /Unknown workflow flow "nope"/,
    );
  });
});
