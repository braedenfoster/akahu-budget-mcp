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
 *   - `household_timezone`     IANA zone       — local today for the Spending allowance (ADR-0011).
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
  // Phase-2 attribution (ADR-0010). Nullable so existing rows and system writes
  // (no actor) stay valid. `actor_source` is 'tailnet' | 'oauth'.
  actorMemberId: integer("actor_member_id").references(
    (): typeof members.id => members.id,
  ),
  actorSource: text("actor_source"),
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

// --- Ticket 03: transactions + sync cursor --------------------------------

/**
 * Cached Transactions. Typed columns for querying plus the full raw Akahu
 * payload, so categorization is fully re-derivable without re-fetching
 * (ADR-0005). `amountCents` is signed as Akahu reports it: negative = debit
 * (money out), positive = credit (money in).
 */
export const transactions = sqliteTable("transactions", {
  akahuId: text("akahu_id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.akahuId),
  date: text("date").notNull(), // YYYY-MM-DD (calendar date of the transaction)
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  description: text("description").notNull(),
  merchant: text("merchant"),
  akahuCategoryId: text("akahu_category_id"),
  // Akahu's personal_finance group name, the seed for Mapping Rules (ADR-0007).
  akahuCategoryGroup: text("akahu_category_group"),
  type: text("type"),
  pending: integer("pending", { mode: "boolean" }).notNull().default(false),
  // Whether this credit counts as household Income. Derived (= income_stream_id
  // IS NOT NULL), set by the classification pass, never the sync heuristic
  // (ADR-0009).
  isIncome: integer("is_income", { mode: "boolean" }).notNull().default(false),
  // The Income Stream this credit is classified into (ADR-0009). Null = not
  // Income. Set by the classification pass alongside is_income.
  incomeStreamId: integer("income_stream_id").references(
    (): typeof incomeStreams.id => incomeStreams.id,
  ),
  // True when set by a one-off classify_income; protects it from re-derivation
  // when Income Rules change (mirrors category_override).
  incomeOverride: integer("income_override", { mode: "boolean" })
    .notNull()
    .default(false),
  // Resolved Budget Category (ticket 04). Null until categorization runs.
  budgetCategoryId: integer("budget_category_id").references(
    (): typeof budgetCategories.id => budgetCategories.id,
  ),
  // True when set by a one-off categorize_transaction; protects it from
  // re-derivation when Mapping Rules change.
  categoryOverride: integer("category_override", { mode: "boolean" })
    .notNull()
    .default(false),
  raw: text("raw").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Per-Connection incremental sync cursor + last-synced stamp (ADR-0005). */
export const syncState = sqliteTable("sync_state", {
  connectionId: integer("connection_id")
    .primaryKey()
    .references(() => connections.id),
  cursor: text("cursor"),
  lastSyncedAt: text("last_synced_at"),
});

// --- Ticket 04: budget categories + mapping rules -------------------------

export const CATEGORY_KINDS = ["committed", "flexible"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/**
 * Household-defined Budget Categories (ADR-0007). Exactly one is the system
 * `Uncategorized` catch-all (isSystem = true) so totals always reconcile.
 */
export const budgetCategories = sqliteTable("budget_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  // Defaults to committed so unflagged categories understate the Spending
  // allowance rather than overstate it (ADR-0011).
  kind: text("kind", { enum: CATEGORY_KINDS }).notNull().default("committed"),
  createdAt: text("created_at").notNull(),
});

/**
 * Mapping Rules route a merchant or an Akahu personal_finance group to a Budget
 * Category (ADR-0007). Data, not code. Seeded from groups, then AI/human
 * refined. One rule per (matchType, matchValue); merchant rules win over group
 * rules, then higher priority, then most recent.
 */
export const mappingRules = sqliteTable(
  "mapping_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    matchType: text("match_type").notNull(), // 'merchant' | 'akahu_group'
    matchValue: text("match_value").notNull(),
    budgetCategoryId: integer("budget_category_id")
      .notNull()
      .references(() => budgetCategories.id),
    priority: integer("priority").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ matchUnique: unique().on(t.matchType, t.matchValue) }),
);

// --- Income Streams + Income Rules (ADR-0009) -----------------------------

/**
 * Household-defined Income Streams (ADR-0009) — the income-side twin of Budget
 * Categories. Exactly one is the system `Unclassified income` catch-all
 * (isSystem = true) so actual-income totals always reconcile.
 */
export const incomeStreams = sqliteTable("income_streams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

/**
 * Income Rules route a merchant / description / Akahu group / Akahu `type` to an
 * Income Stream (ADR-0009). A separate table from `mapping_rules` for clean FKs
 * and constraints, but run through the same matcher. One rule per
 * (matchType, matchValue); precedence is defined by the shared matcher.
 */
export const incomeRules = sqliteTable(
  "income_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    matchType: text("match_type").notNull(),
    matchValue: text("match_value").notNull(),
    incomeStreamId: integer("income_stream_id")
      .notNull()
      .references(() => incomeStreams.id),
    priority: integer("priority").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ matchUnique: unique().on(t.matchType, t.matchValue) }),
);

// --- Ticket 05: budgets + envelopes ---------------------------------------

/**
 * A Budget is the set of Envelopes for the Household in a Period (ADR-0004).
 * Keyed on the Period key ("YYYY-MM"); the explicit start/end range is stored so
 * a later `budget_month_start_day` change never rewrites history.
 */
export const budgets = sqliteTable("budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  periodKey: text("period_key").notNull().unique(),
  periodStart: text("period_start").notNull(), // YYYY-MM-DD inclusive
  periodEnd: text("period_end").notNull(), // YYYY-MM-DD inclusive
  currency: text("currency").notNull(),
  /** Household expected income for this Period; null until set. */
  expectedIncomeCents: integer("expected_income_cents"),
  createdAt: text("created_at").notNull(),
});

/** A Budget Category's allocation for a Period, in integer cents. */
export const envelopes = sqliteTable(
  "envelopes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    budgetId: integer("budget_id")
      .notNull()
      .references(() => budgets.id),
    budgetCategoryId: integer("budget_category_id")
      .notNull()
      .references(() => budgetCategories.id),
    allocatedCents: integer("allocated_cents").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ perCategory: unique().on(t.budgetId, t.budgetCategoryId) }),
);

// --- Ticket 07: planned purchases -----------------------------------------

/**
 * A Planned Purchase is a persisted intended expense — a list entry, NOT a
 * reservation against an Envelope (ADR-0004 defers reserving). `targetPeriod`
 * may name a future Period. Lifecycle via `status`.
 */
export const plannedPurchases = sqliteTable("planned_purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  targetCategoryId: integer("target_category_id").references(() => budgetCategories.id),
  targetPeriod: text("target_period").notNull(), // YYYY-MM
  priority: integer("priority").notNull().default(0),
  status: text("status").notNull().default("planned"), // planned | purchased | dropped
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
