import "dotenv/config";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { makeContext } from "./context.js";
import { openAndMigrate } from "./db/index.js";
import { seedSettingsFromConfig } from "./bootstrap.js";
import { buildMcpServer } from "./mcp.js";

/**
 * Phase 1 entry point: an MCP server over Streamable HTTP, reached privately
 * over Tailscale (ADR-0002). No OAuth — the tailnet is the auth. Each POST /mcp
 * is handled statelessly (a fresh server + transport per request), which is
 * ample for a single always-on household deployment.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const db = openAndMigrate(config.databasePath);
  const ctx = makeContext(db);

  seedSettingsFromConfig(ctx, config);

  const app = express();
  app.use(express.json());

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/mcp", async (req, res) => {
    const server = buildMcpServer(ctx);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request failed:", err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // Streamable HTTP GET/DELETE (SSE stream, session teardown) are unused in
  // stateless mode; reply with Method Not Allowed rather than hanging.
  const methodNotAllowed = (_req: express.Request, res: express.Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  app.listen(config.port, config.host, () => {
    console.log(
      `akahu-budget-mcp listening on http://${config.host}:${config.port}/mcp ` +
        `(read_only=${config.readOnly}, connections=${config.connections.length})`,
    );
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
