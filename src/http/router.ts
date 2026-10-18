import express, { Router, type Express, type Request, type RequestHandler } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Authorizer } from "../auth/authorize.js";
import {
  PROTECTED_RESOURCE_PATH,
  makeAuthenticateMiddleware,
  makeResourceMetadataHandler,
} from "../auth/middleware.js";
import type { AuthConfig } from "../config.js";
import { withActor, type Actor, type AppContext } from "../context.js";
import { buildMcpServer } from "../mcp.js";
import { buildApiRouter } from "./api.js";
import { buildWidgetRouter } from "./widget.js";

/**
 * Shared factory for both Phase-2 listeners (ADR-0010). The two processes'
 * listeners differ only in their middleware chain and which actor they inject;
 * the `/mcp` handler, transport, and tool contract are identical. Passing no
 * options yields an OAuth-free MCP router.
 */
export interface McpRouterOptions {
  /** Middleware run before `POST /mcp` — the OAuth gate on the public listener. */
  authenticate?: RequestHandler;
  /** Actor for a request. Default: none (audit rows recorded without attribution). */
  resolveActor?: (req: Request) => Actor | undefined;
  /** An extra GET route (e.g. RFC 9728 metadata) mounted before `/mcp`. */
  wellKnown?: { path: string; handler: RequestHandler };
}

export function buildMcpRouter(ctx: AppContext, opts: McpRouterOptions = {}): Router {
  const router = Router();
  const resolveActor = opts.resolveActor ?? (() => undefined);

  router.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  if (opts.wellKnown) {
    router.get(opts.wellKnown.path, opts.wellKnown.handler);
  }

  // A fresh server + transport per request (stateless), with a request-scoped
  // context so the write wrapper stamps the right actor.
  const handleMcp: RequestHandler = async (req, res) => {
    const reqCtx = withActor(ctx, resolveActor(req));
    const server = buildMcpServer(reqCtx);
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
  };

  if (opts.authenticate) {
    router.post("/mcp", opts.authenticate, handleMcp);
  } else {
    router.post("/mcp", handleMcp);
  }

  // Streamable HTTP GET/DELETE (SSE stream, session teardown) are unused in
  // stateless mode; reply with Method Not Allowed rather than hanging.
  const methodNotAllowed: RequestHandler = (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  };
  router.get("/mcp", methodNotAllowed);
  router.delete("/mcp", methodNotAllowed);

  return router;
}

/** An express app wrapping {@link buildMcpRouter} with JSON body parsing. */
export function buildMcpApp(ctx: AppContext, opts: McpRouterOptions = {}): Express {
  const app = express();
  app.use(express.json());
  app.use(buildMcpRouter(ctx, opts));
  return app;
}

/** The OAuth-free tailnet listener (ADR-0002): MCP plus the widget routes. */
export function buildTailnetApp(ctx: AppContext, actor: Actor | undefined): Express {
  const app = buildMcpApp(ctx, { resolveActor: () => actor });
  app.use(buildWidgetRouter(ctx));
  return app;
}

/**
 * The OAuth-guarded public listener (ADR-0010, ADR-0013). It must never serve
 * the widget routes, and every `/api` route must sit behind `authenticate`.
 */
export function buildPublicApp(
  ctx: AppContext,
  opts: { authorize: Authorizer; auth: AuthConfig },
): Express {
  const authenticate = makeAuthenticateMiddleware(opts.authorize);
  const app = buildMcpApp(ctx, {
    authenticate,
    resolveActor: (req) => req.actor,
    wellKnown: {
      path: PROTECTED_RESOURCE_PATH,
      handler: makeResourceMetadataHandler(opts.auth),
    },
  });
  app.use("/api", authenticate, buildApiRouter(ctx));
  return app;
}
