import { and, eq, gte, lte } from "drizzle-orm";
import { getDataAsOf, householdTimezone, type AppContext } from "../context.js";
import { budgetCategories, transactions } from "../db/schema.js";
import { daysLeftInPeriod, localDate, periodLengthDays, type Period } from "../period.js";
import { computeEnvelopes, findBudget, spendCountSql } from "./engine.js";

export interface SpendingAllowance {
  period: string;
  status: "ok" | "over" | "no_budget";
  /** Signed; null when no_budget. */
  amount_cents: number | null;
  per_week_cents: number | null;
  days_left: number;
  flexible_remaining_cents: number | null;
  committed_overspend_cents: number | null;
  uncategorized_spent_cents: number | null;
  /** Uncategorized spend Transactions in the Period. */
  uncategorized_count: number;
  data_as_of: string | null;
  stale: boolean;
}

/**
 * The Household's Flexible money left in a Period (ADR-0011). Every caller
 * must use this function rather than redo the math, so all surfaces quote one
 * number. Planned Purchases are not read: they are a list, not reservations.
 */
export function computeSpendingAllowance(ctx: AppContext, period: Period): SpendingAllowance {
  const budget = findBudget(ctx, period.key);
  const categories = ctx.db
    .select({ id: budgetCategories.id, kind: budgetCategories.kind, isSystem: budgetCategories.isSystem })
    .from(budgetCategories)
    .all();
  const uncategorizedId = categories.find((c) => c.isSystem)?.id;
  const today = localDate(ctx.now(), householdTimezone(ctx));
  const daysLeft = Math.min(daysLeftInPeriod(period, today), periodLengthDays(period));

  const dataAsOf = getDataAsOf(ctx);

  const base = {
    period: period.key,
    days_left: daysLeft,
    uncategorized_count: uncategorizedCount(ctx, period, uncategorizedId),
    data_as_of: dataAsOf,
    stale: isStale(dataAsOf, ctx.now()),
  };
  if (!budget) {
    return {
      ...base,
      status: "no_budget",
      amount_cents: null,
      per_week_cents: null,
      flexible_remaining_cents: null,
      committed_overspend_cents: null,
      uncategorized_spent_cents: null,
    };
  }

  const kindById = new Map(categories.map((c) => [c.id, c.kind]));
  let flexibleRemaining = 0;
  let committedOverspend = 0;
  let uncategorizedSpent = 0;
  // Uncategorized has its own rule, so its kind is ignored.
  for (const e of computeEnvelopes(ctx, period, budget.id)) {
    if (e.category_id === uncategorizedId) uncategorizedSpent = e.spent_cents;
    else if (kindById.get(e.category_id) === "flexible") flexibleRemaining += e.remaining_cents;
    else committedOverspend += Math.max(0, -e.remaining_cents);
  }
  const amount = flexibleRemaining - committedOverspend - uncategorizedSpent;

  return {
    ...base,
    status: amount < 0 ? "over" : "ok",
    amount_cents: amount,
    per_week_cents: perWeek(amount, daysLeft),
    flexible_remaining_cents: flexibleRemaining,
    committed_overspend_cents: committedOverspend,
    uncategorized_spent_cents: uncategorizedSpent,
  };
}

// Sync runs nightly, so 36 hours means at least one sync was missed.
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

function isStale(dataAsOf: string | null, now: Date): boolean {
  if (dataAsOf === null) return true;
  const age = now.getTime() - new Date(dataAsOf).getTime();
  // An unreadable stamp gives NaN, which must read as stale.
  return !(age <= STALE_AFTER_MS);
}

function perWeek(amount: number, daysLeft: number): number | null {
  if (amount < 0 || daysLeft === 0) return null;
  if (daysLeft <= 7) return amount;
  return Math.floor((amount * 7) / daysLeft);
}

function uncategorizedCount(ctx: AppContext, period: Period, uncategorizedId: number | undefined): number {
  if (uncategorizedId === undefined) return 0;
  const row = ctx.db
    .select({ count: spendCountSql })
    .from(transactions)
    .where(
      and(
        eq(transactions.budgetCategoryId, uncategorizedId),
        gte(transactions.date, period.startDate),
        lte(transactions.date, period.endDate),
      ),
    )
    .get();
  return row?.count ?? 0;
}
