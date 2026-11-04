import { and, eq, gt, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import {
  accounts,
  connections,
  incomeRules,
  incomeStreams,
  members,
  transactions,
} from "../db/schema.js";
import { buildMatcher } from "../matching/matcher.js";
import type { Period } from "../period.js";

/** The system catch-all Income Stream (ADR-0009). */
export const UNCLASSIFIED_INCOME_NAME = "Unclassified income";

/**
 * Ensure the system Unclassified income Stream exists; return its id. Looked up
 * by the `is_system` flag, not by name, so a rename of the catch-all can never
 * make the classification pass insert a second one and orphan the fallback set.
 */
export function ensureUnclassifiedIncome(ctx: AppContext): number {
  const existing = ctx.db
    .select({ id: incomeStreams.id })
    .from(incomeStreams)
    .where(eq(incomeStreams.isSystem, true))
    .get();
  if (existing) return existing.id;
  return ctx.db
    .insert(incomeStreams)
    .values({ name: UNCLASSIFIED_INCOME_NAME, isSystem: true, createdAt: ctx.now().toISOString() })
    .returning({ id: incomeStreams.id })
    .get().id;
}

/** Ensure an Income Stream with the given name exists; return its id. */
export function ensureIncomeStreamByName(ctx: AppContext, name: string): number {
  const existing = ctx.db
    .select({ id: incomeStreams.id })
    .from(incomeStreams)
    .where(eq(incomeStreams.name, name))
    .get();
  if (existing) return existing.id;
  return ctx.db
    .insert(incomeStreams)
    .values({ name, isSystem: false, createdAt: ctx.now().toISOString() })
    .returning({ id: incomeStreams.id })
    .get().id;
}

/** Guard: does an Income Stream exist? */
export function incomeStreamExists(ctx: AppContext, streamId: number): boolean {
  return (
    ctx.db
      .select({ id: incomeStreams.id })
      .from(incomeStreams)
      .where(eq(incomeStreams.id, streamId))
      .get() !== undefined
  );
}

/** True if the given Stream is the system Unclassified income one. */
export function isSystemIncomeStream(ctx: AppContext, streamId: number): boolean {
  const row = ctx.db
    .select({ isSystem: incomeStreams.isSystem })
    .from(incomeStreams)
    .where(eq(incomeStreams.id, streamId))
    .get();
  return row?.isSystem ?? false;
}

/** Reassign every Transaction and Income Rule from one Stream to another. */
export function reassignIncomeStream(ctx: AppContext, fromId: number, toId: number): void {
  ctx.db
    .update(transactions)
    .set({ incomeStreamId: toId })
    .where(eq(transactions.incomeStreamId, fromId))
    .run();
  ctx.db
    .update(incomeRules)
    .set({ incomeStreamId: toId })
    .where(eq(incomeRules.incomeStreamId, fromId))
    .run();
}

/**
 * Sum of a Period's `is_income` credits, in integer cents — the single
 * definition both the per-Stream breakdown and the coverage report aggregate on
 * (mirrors the named SQL fragments in `budget/engine.ts`, ADR-0008).
 */
function periodIncomeSql(period: Period) {
  return sql<number>`coalesce(sum(case when ${transactions.isIncome} = 1 and ${transactions.date} >= ${period.startDate} and ${transactions.date} <= ${period.endDate} then ${transactions.amountCents} else 0 end), 0)`;
}

/** Load all Income Rules once and return the shared matcher over them. */
function buildIncomeMatcher(ctx: AppContext): ReturnType<typeof buildMatcher> {
  const rules = ctx.db
    .select({
      matchType: incomeRules.matchType,
      matchValue: incomeRules.matchValue,
      targetId: incomeRules.incomeStreamId,
      priority: incomeRules.priority,
      id: incomeRules.id,
    })
    .from(incomeRules)
    .all();
  return buildMatcher(rules);
}

/**
 * Re-derive the Income Stream for every non-overridden positive Transaction from
 * its stored fields (ADR-0009), so refining Income Rules reclassifies history
 * without re-fetching from Akahu. For each positive credit:
 *   0. one leg of an Internal transfer pair -> not Income (ADR-0012);
 *   1. an Income Rule match -> that named Stream;
 *   2. else a positive non-TRANSFER credit -> Unclassified income;
 *   3. else (a positive TRANSFER with no rule) -> not Income.
 * `is_income` is set from the result (`income_stream_id IS NOT NULL`).
 * One-off classifications (`income_override`) are preserved. Debits are never
 * Income and are left untouched. Returns the number of Transactions whose Stream
 * changed.
 */
export function reclassifyIncome(ctx: AppContext): number {
  const unclassifiedId = ensureUnclassifiedIncome(ctx);
  const match = buildIncomeMatcher(ctx);
  const rows = ctx.db
    .select({
      akahuId: transactions.akahuId,
      merchant: transactions.merchant,
      description: transactions.description,
      group: transactions.akahuCategoryGroup,
      type: transactions.type,
      pairId: transactions.transferPairId,
      current: transactions.incomeStreamId,
    })
    .from(transactions)
    .where(and(eq(transactions.incomeOverride, false), gt(transactions.amountCents, 0)))
    .all();

  let changed = 0;
  ctx.db.transaction(() => {
    for (const row of rows) {
      const matched = match({
        merchant: row.merchant,
        description: row.description,
        group: row.group,
        type: row.type,
      });
      let resolved: number | null;
      if (row.pairId !== null) resolved = null;
      else if (matched !== undefined) resolved = matched;
      else if (row.type !== "TRANSFER") resolved = unclassifiedId;
      else resolved = null;
      if (row.current !== resolved) {
        ctx.db
          .update(transactions)
          .set({ incomeStreamId: resolved, isIncome: resolved !== null })
          .where(eq(transactions.akahuId, row.akahuId))
          .run();
        changed++;
      }
    }
  });
  return changed;
}

/**
 * Classify Income as part of the sync -> categorize -> classify pass. A named
 * seam for `runCategorization`; `reclassifyIncome` seeds the system Stream and
 * re-derives every non-overridden credit.
 */
export function runIncomeClassification(ctx: AppContext): void {
  reclassifyIncome(ctx);
}

export interface StreamActual {
  stream_id: number;
  stream: string;
  is_system: boolean;
  actual_cents: number;
  /** Total Transactions ever classified into this Stream (any Period). */
  txn_count: number;
}

/**
 * Per-Stream actual Income for a Period. Every Stream is listed (including ones
 * with no Income this Period, so a Household can watch a Stream — e.g. PPL —
 * fall to zero); `txn_count` is the all-time count so reporting can drop Streams
 * never used. `actual_cents` sums this Period's `is_income` credits, so summing
 * it over used Streams reconciles with total actual income.
 */
export function streamActuals(ctx: AppContext, period: Period): StreamActual[] {
  const actual = periodIncomeSql(period);
  const count = sql<number>`count(${transactions.akahuId})`;
  const rows = ctx.db
    .select({
      streamId: incomeStreams.id,
      name: incomeStreams.name,
      isSystem: incomeStreams.isSystem,
      actual,
      count,
    })
    .from(incomeStreams)
    .leftJoin(transactions, eq(transactions.incomeStreamId, incomeStreams.id))
    .groupBy(incomeStreams.id)
    .all();
  return rows
    .map((r) => ({
      stream_id: r.streamId,
      stream: r.name,
      is_system: r.isSystem,
      actual_cents: r.actual,
      txn_count: r.count,
    }))
    .sort((a, b) => a.stream.localeCompare(b.stream));
}

export interface StreamBreakdown {
  stream: string;
  actual_cents: number;
}

/**
 * The per-Stream Income breakdown for a Period's reports (ADR-0009): every
 * Stream that has ever received Income, with this Period's actual (0 allowed).
 */
export function incomeByStream(ctx: AppContext, period: Period): StreamBreakdown[] {
  return streamActuals(ctx, period)
    .filter((s) => s.txn_count > 0)
    .map((s) => ({ stream: s.stream, actual_cents: s.actual_cents }));
}

export interface AccountCoverage {
  account_id: string;
  account: string;
  member: string;
  income_cents: number;
  /** No Income landed here this Period — a possible missing-income source. */
  flagged: boolean;
}

export interface CoverageReport {
  accounts: AccountCoverage[];
  total_income_cents: number;
}

/**
 * Per connected Account, the Income seen in a Period, flagging Accounts with
 * zero Income as possible missing-income sources (the "income lands in an
 * account the app can't see" signal, ADR-0009). Only reasons about connected
 * Accounts.
 */
export function incomeCoverage(ctx: AppContext, period: Period): CoverageReport {
  const income = periodIncomeSql(period);
  const rows = ctx.db
    .select({
      accountId: accounts.akahuId,
      name: accounts.name,
      member: members.name,
      income,
    })
    .from(accounts)
    .innerJoin(connections, eq(accounts.connectionId, connections.id))
    .innerJoin(members, eq(connections.memberId, members.id))
    .leftJoin(transactions, eq(transactions.accountId, accounts.akahuId))
    .groupBy(accounts.akahuId)
    .all();
  const accountViews = rows
    .map((r) => ({
      account_id: r.accountId,
      account: r.name,
      member: r.member,
      income_cents: r.income,
      flagged: r.income === 0,
    }))
    .sort((a, b) => a.account.localeCompare(b.account));
  return {
    accounts: accountViews,
    total_income_cents: accountViews.reduce((s, a) => s + a.income_cents, 0),
  };
}
