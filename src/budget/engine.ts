import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import {
  budgetMonthStartDay,
  getSetting,
  householdToday,
  SETTING_HOME_CURRENCY,
} from "../context.js";
import { budgetCategories, budgets, envelopes, transactions } from "../db/schema.js";
import { incomeByStream, type StreamBreakdown } from "../income/engine.js";
import { periodForDate, periodFromKey, periodView, type Period } from "../period.js";

export function homeCurrency(ctx: AppContext): string {
  return getSetting(ctx, SETTING_HOME_CURRENCY) ?? "NZD";
}

/**
 * Shared aggregation fragments (single source of truth for the spend/income
 * definitions across the budget and reports engines; ADR-0008 endorses
 * hand-written SQL for aggregations). A spend row is neither income nor an
 * internal transfer. `nonIncomeNet` is the signed net of spend rows and
 * `spendCount` counts them; `incomeNet` is the sum of income-tagged credits.
 */
const isSpendSql = sql`${transactions.isIncome} = 0 and (${transactions.type} is null or ${transactions.type} != 'TRANSFER')`;
export const nonIncomeNetSql = sql<number>`coalesce(sum(case when ${isSpendSql} then ${transactions.amountCents} else 0 end), 0)`;
export const spendCountSql = sql<number>`coalesce(sum(case when ${isSpendSql} then 1 else 0 end), 0)`;
export const incomeNetSql = sql<number>`coalesce(sum(case when ${transactions.isIncome} = 1 then ${transactions.amountCents} else 0 end), 0)`;

/** Resolve a Period from an optional key; default is the Period containing now. */
export function resolvePeriod(ctx: AppContext, key?: string): Period {
  const startDay = budgetMonthStartDay(ctx);
  if (key) return periodFromKey(key, startDay);
  return periodForDate(householdToday(ctx), startDay);
}

/** Look up a Budget by Period key, if it exists. */
export function findBudget(ctx: AppContext, periodKey: string) {
  return ctx.db.select().from(budgets).where(eq(budgets.periodKey, periodKey)).get();
}

/** Ensure a Budget row exists for the Period; return its id. */
export function ensureBudget(ctx: AppContext, period: Period): number {
  const existing = findBudget(ctx, period.key);
  if (existing) return existing.id;
  return ctx.db
    .insert(budgets)
    .values({
      periodKey: period.key,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      currency: homeCurrency(ctx),
      createdAt: ctx.now().toISOString(),
    })
    .returning({ id: budgets.id })
    .get().id;
}

/** Current allocation for a category in a budget (0 if no Envelope yet). */
export function getAllocation(ctx: AppContext, budgetId: number, categoryId: number): number {
  const row = ctx.db
    .select({ allocatedCents: envelopes.allocatedCents })
    .from(envelopes)
    .where(and(eq(envelopes.budgetId, budgetId), eq(envelopes.budgetCategoryId, categoryId)))
    .get();
  return row?.allocatedCents ?? 0;
}

/** Upsert an Envelope's allocation (integer cents) for a category in a budget. */
export function setAllocation(
  ctx: AppContext,
  budgetId: number,
  categoryId: number,
  allocatedCents: number,
): void {
  ctx.db
    .insert(envelopes)
    .values({
      budgetId,
      budgetCategoryId: categoryId,
      allocatedCents,
      createdAt: ctx.now().toISOString(),
    })
    .onConflictDoUpdate({
      target: [envelopes.budgetId, envelopes.budgetCategoryId],
      set: { allocatedCents },
    })
    .run();
}

/**
 * Move allocation between two Envelopes of a budget (the Reallocate domain
 * operation, user story 29). Allocations stay non-negative: throws if the source
 * Envelope holds less than `amountCents`. No real money moves — planning only.
 */
export function reallocate(
  ctx: AppContext,
  budgetId: number,
  fromCategoryId: number,
  toCategoryId: number,
  amountCents: number,
): void {
  const fromAllocated = getAllocation(ctx, budgetId, fromCategoryId);
  if (fromAllocated < amountCents) {
    throw new Error(
      `Source Envelope has only ${fromAllocated}c allocated; cannot move ${amountCents}c.`,
    );
  }
  setAllocation(ctx, budgetId, fromCategoryId, fromAllocated - amountCents);
  setAllocation(ctx, budgetId, toCategoryId, getAllocation(ctx, budgetId, toCategoryId) + amountCents);
}

/** Copy allocations and expected income from a source budget into a target. */
export function copyAllocations(ctx: AppContext, fromBudgetId: number, toBudgetId: number): void {
  const rows = ctx.db
    .select({ categoryId: envelopes.budgetCategoryId, allocatedCents: envelopes.allocatedCents })
    .from(envelopes)
    .where(eq(envelopes.budgetId, fromBudgetId))
    .all();
  for (const r of rows) setAllocation(ctx, toBudgetId, r.categoryId, r.allocatedCents);
}

/**
 * Per-category net spend for a Period. Spend excludes income-tagged credits (so
 * salary never masquerades as negative spending) and internal transfers (moving
 * money between the Household's own accounts isn't spending). In V1 every
 * non-transfer credit is tagged income (spec story 28: variable income captured
 * without special handling), so a store refund is counted as income rather than
 * reducing a category's spend — refining refund-vs-income is deferred.
 */
function spendByCategory(ctx: AppContext, period: Period): Map<number, number> {
  const rows = ctx.db
    .select({
      categoryId: transactions.budgetCategoryId,
      netAmount: nonIncomeNetSql,
    })
    .from(transactions)
    .where(and(gte(transactions.date, period.startDate), lte(transactions.date, period.endDate)))
    .groupBy(transactions.budgetCategoryId)
    .all();
  const map = new Map<number, number>();
  for (const r of rows) {
    if (r.categoryId === null) continue;
    // Outflow is positive spent. `0 -` keeps a zero net from becoming -0.
    map.set(r.categoryId, 0 - r.netAmount);
  }
  return map;
}

/** Actual income for a Period: sum of income-tagged credits (cents). */
export function actualIncomeCents(ctx: AppContext, period: Period): number {
  const row = ctx.db
    .select({ total: incomeNetSql })
    .from(transactions)
    .where(and(gte(transactions.date, period.startDate), lte(transactions.date, period.endDate)))
    .get();
  return row?.total ?? 0;
}

export interface EnvelopeView {
  category_id: number;
  category: string;
  allocated_cents: number;
  spent_cents: number;
  remaining_cents: number;
  slack_cents: number;
}

export interface BudgetSnapshot {
  period: { key: string; start: string; end: string };
  currency: string;
  has_budget: boolean;
  envelopes: EnvelopeView[];
  income: { expected_cents: number | null; actual_cents: number; by_stream: StreamBreakdown[] };
  totals: { allocated_cents: number; spent_cents: number; remaining_cents: number };
  household_headroom_cents: number;
}

/**
 * Compute the full Budget picture for a Period entirely server-side (ADR-0003):
 * per-Envelope allocated/spent/remaining/slack, expected + actual income,
 * totals, and Household headroom. Every value is integer cents.
 */
export function computeBudget(ctx: AppContext, period: Period): BudgetSnapshot {
  // Pure read: no seeding here, so get_budget and evaluate_purchase never
  // mutate state (ticket 06). Uncategorized is seeded during sync instead.
  const budget = findBudget(ctx, period.key);
  const envelopeViews = computeEnvelopes(ctx, period, budget?.id);

  const totalAllocated = envelopeViews.reduce((s, e) => s + e.allocated_cents, 0);
  const totalSpent = envelopeViews.reduce((s, e) => s + e.spent_cents, 0);
  const expected = budget?.expectedIncomeCents ?? null;
  const actual = actualIncomeCents(ctx, period);
  const incomeBasis = expected ?? actual;

  return {
    period: periodView(period),
    currency: budget?.currency ?? homeCurrency(ctx),
    has_budget: budget !== undefined,
    envelopes: envelopeViews,
    income: { expected_cents: expected, actual_cents: actual, by_stream: incomeByStream(ctx, period) },
    totals: {
      allocated_cents: totalAllocated,
      spent_cents: totalSpent,
      remaining_cents: totalAllocated - totalSpent,
    },
    // Money not yet assigned to any Envelope (CONTEXT.md): income - allocated.
    household_headroom_cents: incomeBasis - totalAllocated,
  };
}

/**
 * Envelopes shown = every allocated Envelope, plus any Budget Category with
 * spend in the Period but no allocation (allocated 0), so totals reconcile with
 * the underlying Transactions.
 */
export function computeEnvelopes(
  ctx: AppContext,
  period: Period,
  budgetId: number | undefined,
): EnvelopeView[] {
  const spend = spendByCategory(ctx, period);

  const allocationRows = budgetId !== undefined
    ? ctx.db
        .select({
          categoryId: envelopes.budgetCategoryId,
          allocatedCents: envelopes.allocatedCents,
          name: budgetCategories.name,
        })
        .from(envelopes)
        .innerJoin(budgetCategories, eq(envelopes.budgetCategoryId, budgetCategories.id))
        .where(eq(envelopes.budgetId, budgetId))
        .all()
    : [];

  const nameById = new Map<number, string>();
  for (const c of ctx.db.select({ id: budgetCategories.id, name: budgetCategories.name }).from(budgetCategories).all()) {
    nameById.set(c.id, c.name);
  }

  const allocatedByCategory = new Map<number, number>();
  for (const a of allocationRows) allocatedByCategory.set(a.categoryId, a.allocatedCents);

  // Union of allocated categories and categories with spend this Period.
  const categoryIds = new Set<number>([...allocatedByCategory.keys(), ...spend.keys()]);

  const envelopeViews: EnvelopeView[] = [];
  for (const categoryId of categoryIds) {
    const allocated = allocatedByCategory.get(categoryId) ?? 0;
    const spent = spend.get(categoryId) ?? 0;
    const remaining = allocated - spent;
    envelopeViews.push({
      category_id: categoryId,
      category: nameById.get(categoryId) ?? `#${categoryId}`,
      allocated_cents: allocated,
      spent_cents: spent,
      remaining_cents: remaining,
      slack_cents: remaining, // Slack = allocated - spent (CONTEXT.md)
    });
  }
  envelopeViews.sort((a, b) => a.category.localeCompare(b.category));
  return envelopeViews;
}
