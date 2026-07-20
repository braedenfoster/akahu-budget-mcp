import { and, gte, isNotNull, lte } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { budgetMonthStartDay } from "../context.js";
import { transactions } from "../db/schema.js";
import {
  computeBudget,
  homeCurrency,
  incomeNetSql,
  nonIncomeNetSql,
} from "../budget/engine.js";
import { periodView, previousPeriod, type Period } from "../period.js";

/** Total spend (net of non-income credits and transfers) and income, in cents. */
export function periodTotals(ctx: AppContext, period: Period): {
  spent_cents: number;
  income_cents: number;
} {
  const row = ctx.db
    .select({ netNonIncome: nonIncomeNetSql, income: incomeNetSql })
    .from(transactions)
    .where(and(gte(transactions.date, period.startDate), lte(transactions.date, period.endDate)))
    .get();
  return { spent_cents: -(row?.netNonIncome ?? 0), income_cents: row?.income ?? 0 };
}

export interface MerchantSpend {
  merchant: string;
  spent_cents: number;
}

/** Top merchants by spend in a Period (excludes income and null merchants). */
export function topMerchants(ctx: AppContext, period: Period, limit: number): MerchantSpend[] {
  const rows = ctx.db
    .select({ merchant: transactions.merchant, net: nonIncomeNetSql })
    .from(transactions)
    .where(
      and(
        gte(transactions.date, period.startDate),
        lte(transactions.date, period.endDate),
        isNotNull(transactions.merchant),
      ),
    )
    .groupBy(transactions.merchant)
    .all();
  return rows
    .map((r) => ({ merchant: r.merchant as string, spent_cents: -r.net }))
    .filter((r) => r.spent_cents > 0)
    .sort((a, b) => b.spent_cents - a.spent_cents)
    .slice(0, limit);
}

export interface TrendPoint {
  period: string;
  spent_cents: number;
  income_cents: number;
}

/**
 * Spend/income for the last `count` Periods ending at (and including) `period`,
 * oldest first. Uses retained history (ADR-0005), so it spans months regardless
 * of whether a Budget was ever set for them.
 */
export function spendTrend(ctx: AppContext, period: Period, count: number): TrendPoint[] {
  const startDay = budgetMonthStartDay(ctx);
  const periods: Period[] = [];
  let cursor = period;
  for (let i = 0; i < count; i++) {
    periods.push(cursor);
    cursor = previousPeriod(cursor, startDay);
  }
  periods.reverse(); // oldest first
  return periods.map((p) => {
    const totals = periodTotals(ctx, p);
    return { period: p.key, spent_cents: totals.spent_cents, income_cents: totals.income_cents };
  });
}

export interface PeriodSummary {
  period: { key: string; start: string; end: string };
  currency: string;
  has_budget: boolean;
  categories: {
    category_id: number;
    category: string;
    allocated_cents: number;
    spent_cents: number;
    remaining_cents: number;
  }[];
  income_vs_spend: { income_cents: number; spent_cents: number; net_cents: number };
  top_merchants: MerchantSpend[];
  trend: TrendPoint[];
}

/**
 * Structured Period summary (ticket 08, ADR-0003): per-category spend vs
 * allocated, income vs spend, top merchants, and a trend series vs prior
 * Periods. Data only — the AI renders it. Periods with no Budget still report
 * actual spend, and Uncategorized spend is included like any other category.
 */
export function computePeriodSummary(
  ctx: AppContext,
  period: Period,
  opts: { topMerchantsLimit: number; trendPeriods: number },
): PeriodSummary {
  const budget = computeBudget(ctx, period);
  const totals = periodTotals(ctx, period);
  return {
    period: periodView(period),
    currency: budget.currency || homeCurrency(ctx),
    has_budget: budget.has_budget,
    categories: budget.envelopes.map((e) => ({
      category_id: e.category_id,
      category: e.category,
      allocated_cents: e.allocated_cents,
      spent_cents: e.spent_cents,
      remaining_cents: e.remaining_cents,
    })),
    income_vs_spend: {
      income_cents: totals.income_cents,
      spent_cents: totals.spent_cents,
      net_cents: totals.income_cents - totals.spent_cents,
    },
    top_merchants: topMerchants(ctx, period, opts.topMerchantsLimit),
    trend: spendTrend(ctx, period, opts.trendPeriods),
  };
}
