import { z } from "zod";
import { getDataAsOf } from "../context.js";
import { resolvePeriod } from "../budget/engine.js";
import { computePeriodSummary } from "../reports/engine.js";
import { defineTool } from "./types.js";

/**
 * Structured Period summary the AI renders and answers follow-ups on (ticket
 * 08). Read-only, data only, with a data-as-of stamp.
 */
export const getPeriodSummaryTool = defineTool({
  name: "get_period_summary",
  description:
    "Return a structured summary of a Period: per-category spend vs allocated, income vs spend, top merchants by spend, and a spend/income trend vs prior Periods. Data only (the AI renders it), with data-as-of.",
  inputSchema: {
    period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    top_merchants_limit: z.number().int().min(1).max(50).default(5),
    trend_periods: z.number().int().min(1).max(24).default(6),
  },
  handler: (ctx, input) => {
    const period = resolvePeriod(ctx, input.period);
    const summary = computePeriodSummary(ctx, period, {
      topMerchantsLimit: input.top_merchants_limit,
      trendPeriods: input.trend_periods,
    });
    return { ...summary, data_as_of: getDataAsOf(ctx) };
  },
});
