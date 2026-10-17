import { describe, expect, it } from "vitest";
import { WORKFLOW_FLOWS, type WorkflowFlow } from "../src/guides/guides.js";
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

describe("Workflow guides know the Spending allowance (Seam 1)", () => {
  const guideFor = (flow: WorkflowFlow) => invokeTool(testContext(), getWorkflowGuideTool, { flow });

  it("create_budget shows Committed and Flexible totals and the Spending allowance before the Member confirms", () => {
    const step = guideFor("create_budget").steps.find((s) => s.includes("allocated_by_kind"));
    expect(step).toBeDefined();
    expect(step).toMatch(/committed_cents/);
    expect(step).toMatch(/flexible_cents/);
    expect(step).toMatch(/spending_allowance/);
    expect(step).toMatch(/before the Member confirms/);
  });

  it("plan_purchase allocates a savings-funded purchase to Home projects after approval and before the payment", () => {
    const guide = guideFor("plan_purchase");
    const step = guide.steps.find((s) => s.includes("Home projects") && s.includes("set_allocation"));
    expect(step).toBeDefined();
    expect(step).toMatch(/savings/i);
    expect(step).toMatch(/after the Member approves/);
    expect(step).toMatch(/before the payment goes out/);
    expect(guide.tools).toContain("set_allocation");
  });

  it("plan_purchase categorizes the savings-funded payment to Home projects", () => {
    const guide = guideFor("plan_purchase");
    const step = guide.steps.find((s) => s.includes("Home projects") && s.includes("categorize_transaction"));
    expect(step).toBeDefined();
    expect(guide.tools).toContain("categorize_transaction");
  });

  it("asks the Member for Committed or Flexible in every step that creates a category", () => {
    const creatingFlows: WorkflowFlow[] = ["create_budget", "review_spending", "plan_purchase"];
    for (const flow of WORKFLOW_FLOWS) {
      const guide = guideFor(flow);
      const createSteps = guide.steps.filter((s) => s.includes("manage_categories"));
      if (creatingFlows.includes(flow)) {
        expect(createSteps.length, `${flow} has no create-category step`).toBeGreaterThan(0);
        expect(guide.tools).toContain("manage_categories");
      }
      for (const step of createSteps) {
        expect(step, flow).toMatch(/ask the Member whether it is Committed or Flexible/);
      }
    }
  });
});
