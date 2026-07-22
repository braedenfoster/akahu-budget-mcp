import type { AppContext } from "./context.js";
import { isReadOnly } from "./context.js";
import { auditLog } from "./db/schema.js";

/**
 * Thrown when a write is attempted while the server is in read-only mode. The
 * tool layer maps this to a clean MCP error; nothing is written, nothing is
 * logged (ADR-0003 write discipline; ticket 01 acceptance criteria).
 */
export class ReadOnlyError extends Error {
  constructor(tool: string) {
    super(`Refused: server is in read-only mode (attempted write via ${tool}).`);
    this.name = "ReadOnlyError";
  }
}

export interface WriteMeta {
  /** Name of the tool performing the write, recorded in the audit log. */
  tool: string;
  /** Human-readable one-line summary of the change. */
  summary: string;
  /** Optional structured detail (JSON-serialisable). Never include secrets. */
  payload?: unknown;
}

/**
 * The single gate every mutation flows through. It:
 *   1. Refuses (throws ReadOnlyError) when `read_only` is on — logging nothing.
 *   2. Runs the mutation and appends one audit_log row atomically, so a change
 *      is never recorded without happening, nor happens without being recorded.
 *
 * `fn` receives the same context and performs the actual writes. Its return
 * value is passed back to the caller.
 */
export function withWrite<T>(
  ctx: AppContext,
  meta: WriteMeta,
  fn: (ctx: AppContext) => T,
): T {
  if (isReadOnly(ctx)) {
    throw new ReadOnlyError(meta.tool);
  }
  const ts = ctx.now().toISOString();
  // Drizzle's better-sqlite3 driver runs the callback synchronously inside
  // BEGIN/COMMIT and returns its value; the whole connection is single-threaded
  // so ctx.db writes inside the callback are part of the same transaction.
  return ctx.db.transaction(() => {
    const result = fn(ctx);
    ctx.db
      .insert(auditLog)
      .values({
        ts,
        tool: meta.tool,
        summary: meta.summary,
        payload: meta.payload === undefined ? null : JSON.stringify(meta.payload),
        // Attribution (ADR-0010): null when no actor is on the context.
        actorMemberId: ctx.actor?.memberId ?? null,
        actorSource: ctx.actor?.source ?? null,
      })
      .run();
    return result;
  });
}
