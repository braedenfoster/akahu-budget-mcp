import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openAndMigrate } from "../src/db/index.js";
import { makeContext, type AppContext } from "../src/context.js";
import { ensureConnection, ensureHousehold, ensureMember } from "../src/household.js";

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

/**
 * Seed a Household + Member + Connection and return the connection id, so tests
 * can drive the sync engine against a fake AkahuClient.
 */
export function seedConnection(
  ctx: AppContext,
  memberName = "Me",
  akahuIndex = 1,
): number {
  const householdId = ensureHousehold(ctx);
  const memberId = ensureMember(ctx, householdId, memberName);
  return ensureConnection(ctx, {
    memberId,
    akahuIndex,
    label: `${memberName} — Akahu ${akahuIndex}`,
  });
}

/** A copy of the migrations folder that stops just before the given tag. */
export function migrationsBefore(tag: string): string {
  const source = path.resolve(import.meta.dirname, "../drizzle");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"));
  const journal = JSON.parse(fs.readFileSync(path.join(source, "meta/_journal.json"), "utf8"));
  const cut = journal.entries.findIndex((e: { tag: string }) => e.tag === tag);
  journal.entries = journal.entries.slice(0, cut);
  fs.mkdirSync(path.join(dir, "meta"));
  fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify(journal));
  for (const e of journal.entries) {
    fs.copyFileSync(path.join(source, `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`));
  }
  return dir;
}
