import { z } from "zod";
import { getGuide, WORKFLOW_FLOWS } from "../guides/guides.js";
import { defineTool } from "./types.js";

/**
 * Fetch a server-side Workflow guide (ADR-0006). Because the guidance is a
 * tool, it works in both Claude and (Phase 2) ChatGPT regardless of whether a
 * front-end surfaces MCP prompts. Read-only.
 */
export const getWorkflowGuideTool = defineTool({
  name: "get_workflow_guide",
  description: `Return the step-by-step guide for a guided flow. Flows: ${WORKFLOW_FLOWS.join(", ")}. The guide orchestrates the other tools; follow its steps in order.`,
  inputSchema: {
    flow: z
      .string()
      .describe(`One of: ${WORKFLOW_FLOWS.join(", ")}`),
  },
  handler: (_ctx, input) => getGuide(input.flow),
});
