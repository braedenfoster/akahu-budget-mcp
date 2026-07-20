import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  unique,
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

// --- Ticket 02: household, members, connections, accounts, snapshots -------

/** The single Household per deployment (ADR-0001). Exactly one row. */
export const households = sqliteTable("households", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

/** A person in the Household. May hold more than one Connection. */
export const members = sqliteTable(
  "members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    // Reserved for Phase 2 email->Member mapping (ADR-0002); nullable in V1.
    email: text("email"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ nameUnique: unique().on(t.householdId, t.name) }),
);

/**
 * One Member's Akahu Personal App credential pair. Tokens are NEVER stored in
 * sqlite — they live in `.env`/memory only. `akahuIndex` links this row back to
 * its `AKAHU_*_<index>` env pair at sync time.
 */
export const connections = sqliteTable("connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id")
    .notNull()
    .references(() => members.id),
  akahuIndex: integer("akahu_index").notNull().unique(),
  label: text("label").notNull(),
  createdAt: text("created_at").notNull(),
});

/**
 * A bank Account surfaced through a Connection. Keyed on Akahu's account id.
 * Member attribution is derived via connection -> member.
 */
export const accounts = sqliteTable("accounts", {
  akahuId: text("akahu_id").primaryKey(),
  connectionId: integer("connection_id")
    .notNull()
    .references(() => connections.id),
  name: text("name").notNull(),
  type: text("type"),
  formattedAccount: text("formatted_account"),
  balanceCents: integer("balance_cents").notNull(),
  currency: text("currency").notNull(),
  // Full raw Akahu account payload as JSON, for re-derivation/debugging.
  raw: text("raw").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * One balance reading per Account per day (ADR-0005), seeding the deferred
 * cashflow feature with history. Keyed on (account, date); re-running a sync the
 * same day updates the day's snapshot rather than duplicating it.
 */
export const balanceSnapshots = sqliteTable(
  "balance_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.akahuId),
    date: text("date").notNull(), // YYYY-MM-DD
    balanceCents: integer("balance_cents").notNull(),
    currency: text("currency").notNull(),
    capturedAt: text("captured_at").notNull(),
  },
  (t) => ({ perDay: unique().on(t.accountId, t.date) }),
);
