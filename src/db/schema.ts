import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * Drizzle schema for the Akahu budgeting MCP server.
 *
 * Conventions (ADR-0005):
 *   - Money is stored as integer minor units (cents) in `*_cents` columns,
 *     always paired with an explicit `currency` (ISO 4217, e.g. "NZD").
 *   - Timestamps are ISO-8601 strings in UTC (text), so the sqlite file is
 *     portable and human-readable.
 *   - We never delete rows that represent history; lifecycle is modelled with
 *     status columns instead.
 */

// --- Ticket 01: cross-cutting infrastructure -------------------------------

/**
 * Key/value settings for the single Household deployment. Notable keys:
 *   - `read_only`             "true" | "false" — when true, every write is refused.
 *   - `budget_month_start_day` "1".."28"       — day a Period begins (ADR-0004).
 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

/**
 * Append-only audit trail. Every mutation flows through the write wrapper
 * (src/write.ts), which records one row here before the change commits.
 */
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: text("ts").notNull(),
  tool: text("tool").notNull(),
  summary: text("summary").notNull(),
  // JSON-encoded structured detail of what changed. Never contains secrets.
  payload: text("payload"),
});
