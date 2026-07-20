import { openAndMigrate } from "../src/db/index.js";
import { makeContext, type AppContext } from "../src/context.js";

/**
 * Seam 1 test harness: a fresh in-memory sqlite, migrated to the latest schema,
 * with a fixed clock. Every tool test seeds from here and invokes tools exactly
 * as the server does.
 */
export function testContext(now = "2026-07-15T09:00:00.000Z"): AppContext {
  const db = openAndMigrate(":memory:");
  const clock = new Date(now);
  return makeContext(db, () => clock);
}

/** Build a context whose clock returns the given ISO instant. */
export function contextAt(iso: string): AppContext {
  return testContext(iso);
}
