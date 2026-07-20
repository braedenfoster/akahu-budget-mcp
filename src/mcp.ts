import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "./context.js";
import { allTools } from "./tools/registry.js";
import { ReadOnlyError } from "./write.js";

export const SERVER_NAME = "akahu-budget-mcp";
export const SERVER_VERSION = "0.1.0";

/**
 * Build an McpServer with every tool from the registry bound to the given
 * context. Each tool handler returns a plain structured object; we surface it
 * as both `structuredContent` and a JSON text block so any client can read it.
 */
export function buildMcpServer(ctx: AppContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      // The SDK validates args against inputSchema before calling us.
      async (args: unknown) => {
        try {
          const output = tool.handler(ctx, args as never);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
            structuredContent: output as Record<string, unknown>,
          };
        } catch (err) {
          const message =
            err instanceof ReadOnlyError
              ? err.message
              : err instanceof Error
                ? err.message
                : String(err);
          return {
            content: [{ type: "text" as const, text: message }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}
