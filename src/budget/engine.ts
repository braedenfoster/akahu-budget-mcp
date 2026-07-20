import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import {
  budgetMonthStartDay,
  getSetting,
  SETTING_HOME_CURRENCY,
} from "../context.js";
import { budgetCategories, budgets, envelopes, transactions } from "../db/schema.js";
import { ensureUncategorized } from "../categorization/engine.js";
import { periodForDate, periodFromKey, type Period } from "../period.js";

export function homeCurrency(ctx: AppContext): string {
  return getSetting(ctx, SETTING_HOME_CURRENCY) ?? "NZD";
}

/** Resolve a Period from an optional key; default is the Period containing now. */
export function resolvePeriod(ctx: AppContext, key?: string): Period {
  const startDay = budgetMonthStartDay(ctx);
  if (key) return periodFromKey(key, startDay);
  return periodForDate(ctx.now().toISOString(), startDay);
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
 * Per-category net spend for a Period. Spend excludes income-tagged credits so
 * salary landing in an account never masquerades as negative spending; ordinary
 * refunds (non-income credits) reduce the category's spend.
 */
function spendByCategory(ctx: AppContext, period: Period): Map<number, number> {
  const rows = ctx.db
    .select({
      categoryId: transactions.budgetCategoryId,
      // Net amount over non-income transactions (signed: debit negative).
      netAmount: sql<number>`coalesce(sum(case when ${transactions.isIncome} = 0 then ${transactions.amountCents} else 0 end), 0)`,
    })
    .from(transactions)
    .where(and(gte(transactions.date, period.startDate), lte(transactions.date, period.endDate)))
    .groupBy(transactions.budgetCategoryId)
    .all();
  const map = new Map<number, number>();
  for (const r of rows) {
    if (r.categoryId === null) continue;
    map.set(r.categoryId, -r.netAmount); // outflow is positive spent
  }
  return map;
}

/** Actual income for a Period: sum of income-tagged credits (cents). */
export function actualIncomeCents(ctx: AppContext, period: Period): number {
  const row = ctx.db
    .select({
      total: sql<number>`coalesce(sum(case when ${transactions.isIncome} = 1 then ${transactions.amountCents} else 0 end), 0)`,
    })
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
  income: { expected_cents: number | null; actual_cents: number };
  totals: { allocated_cents: number; spent_cents: number; remaining_cents: number };
  household_headroom_cents: number;
}

/**
 * Compute the full Budget picture for a Period entirely server-side (ADR-0003):
 * per-Envelope allocated/spent/remaining/slack, expected + actual income,
 * totals, and Household headroom. Every value is integer cents.
 *
 * Envelopes shown = every allocated Envelope, plus any Budget Category with
 * spend in the Period but no allocation (allocated 0), so totals reconcile with
 * the underlying Transactions.
 */
export function computeBudget(ctx: AppContext, period: Period): BudgetSnapshot {
  ensureUncategorized(ctx);
  const budget = findBudget(ctx, period.key);
  const spend = spendByCategory(ctx, period);

  const allocationRows = budget
    ? ctx.db
        .select({
          categoryId: envelopes.budgetCategoryId,
          allocatedCents: envelopes.allocatedCents,
          name: budgetCategories.name,
        })
        .from(envelopes)
        .innerJoin(budgetCategories, eq(envelopes.budgetCategoryId, budgetCategories.id))
        .where(eq(envelopes.budgetId, budget.id))
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

  const totalAllocated = envelopeViews.reduce((s, e) => s + e.allocated_cents, 0);
  const totalSpent = envelopeViews.reduce((s, e) => s + e.spent_cents, 0);
  const expected = budget?.expectedIncomeCents ?? null;
  const actual = actualIncomeCents(ctx, period);
  const incomeBasis = expected ?? actual;

  return {
    period: { key: period.key, start: period.startDate, end: period.endDate },
    currency: budget?.currency ?? homeCurrency(ctx),
    has_budget: budget !== undefined,
    envelopes: envelopeViews,
    income: { expected_cents: expected, actual_cents: actual },
    totals: {
      allocated_cents: totalAllocated,
      spent_cents: totalSpent,
      remaining_cents: totalAllocated - totalSpent,
    },
    // Money not yet assigned to any Envelope (CONTEXT.md): income - allocated.
    household_headroom_cents: incomeBasis - totalAllocated,
  };
}
