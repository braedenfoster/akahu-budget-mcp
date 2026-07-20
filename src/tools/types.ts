import { z } from "zod";
import type { AppContext } from "../context.js";

/**
 * A tool is a pure boundary: (context, validated input) -> structured output.
 * This is Seam 1 — tests seed a temp sqlite, build a context, and invoke the
 * tool exactly as the MCP server does, asserting the returned facts.
 */
export interface ToolDef<Shape extends z.ZodRawShape = z.ZodRawShape, Out = unknown> {
  name: string;
  description: string;
  /** zod raw shape; the MCP SDK consumes this directly as the input schema. */
  inputSchema: Shape;
  handler: (ctx: AppContext, input: z.infer<z.ZodObject<Shape>>) => Out;
}

/**
 * A tool of any shape. Used for heterogeneous collections (the registry) where
 * the specific input/output types differ per tool. Individual tools keep their
 * precise types via `defineTool`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = ToolDef<any, any>;

/** Helper to define a tool with full type inference on the handler input. */
export function defineTool<Shape extends z.ZodRawShape, Out>(
  def: ToolDef<Shape, Out>,
): ToolDef<Shape, Out> {
  return def;
}

/**
 * Invoke a tool the way the server does: validate the raw input against the
 * tool's schema, then run the handler. Both the MCP transport and Seam 1 tests
 * go through this, so validation is part of the tested contract.
 */
export function invokeTool<Shape extends z.ZodRawShape, Out>(
  ctx: AppContext,
  tool: ToolDef<Shape, Out>,
  rawInput: unknown,
): Out {
  const parsed = z.object(tool.inputSchema).parse(rawInput ?? {});
  return tool.handler(ctx, parsed as z.infer<z.ZodObject<Shape>>);
}
