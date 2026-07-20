/**
 * Server-side Workflow guides (ADR-0006). These are the single source of truth
 * for the guided flows, fetched identically by the Claude skills and (Phase 2)
 * the ChatGPT custom GPT — so both Household Members budget the same way.
 *
 * A guide is process, not arithmetic: it tells the AI which tools to call and in
 * what order. The tools compute every number (ADR-0003); the guide never does.
 */

export const WORKFLOW_FLOWS = [
  "create_budget",
  "review_spending",
  "plan_purchase",
  "monthly_report",
] as const;

export type WorkflowFlow = (typeof WORKFLOW_FLOWS)[number];

export interface WorkflowGuide {
  flow: WorkflowFlow;
  title: string;
  overview: string;
  /** Ordered steps; each names the tool(s) to call. */
  steps: string[];
  /** Tools this flow orchestrates. */
  tools: string[];
}

const GUIDES: Record<WorkflowFlow, WorkflowGuide> = {
  create_budget: {
    flow: "create_budget",
    title: "Create or set a budget for a Period",
    overview:
      "Set the Household's expected income and per-category Envelope allocations for a month, then confirm the plan leaves non-negative Household headroom. All figures come from the tools; never do the arithmetic yourself.",
    steps: [
      "Ask which Period to budget (default: the current Period). If starting fresh from last month, call create_budget_for_period with copy_previous=true.",
      "Call get_budget for the Period to show current allocations, spend so far, actual/expected income, and Household headroom.",
      "Confirm the expected income with the Member, then call set_expected_income.",
      "For each Budget Category the Member names, call set_allocation with the agreed amount (convert dollars to integer cents before calling).",
      "Call get_budget again. If household_headroom_cents is negative, tell the Member they have allocated more than they expect to earn and offer to trim an Envelope; otherwise confirm the budget is set.",
    ],
    tools: [
      "get_budget",
      "create_budget_for_period",
      "set_expected_income",
      "set_allocation",
      "list_categories",
    ],
  },
  review_spending: {
    flow: "review_spending",
    title: "Review spending and clean up categorization",
    overview:
      "Walk the Member through where the money went this Period, clear anything Uncategorized, and spot Envelopes that are overspent.",
    steps: [
      "Call get_budget for the Period and highlight any Envelope whose remaining_cents is negative (overspent).",
      "Call list_uncategorized for the Period. For each item, propose a Budget Category based on its merchant/description.",
      "When the Member agrees on a one-off, call categorize_transaction. When it should stick for the future, call set_category_rule (with backfill) instead.",
      "Call list_transactions or search_transactions if the Member wants to drill into a specific Envelope or merchant.",
      "Re-run get_budget to show the cleaned-up picture.",
    ],
    tools: [
      "get_budget",
      "list_uncategorized",
      "categorize_transaction",
      "set_category_rule",
      "list_transactions",
      "search_transactions",
    ],
  },
  plan_purchase: {
    flow: "plan_purchase",
    title: "Decide whether a purchase fits",
    overview:
      "Evaluate a specific purchase (advisory, read-only), then — only if the Member approves — make any reallocation as an explicit write. Also weigh it against the wider wishlist.",
    steps: [
      "Ask for the amount and the target Budget Category (call list_categories if the Member is unsure).",
      "Call evaluate_purchase with the amount in cents and the category. Report the verdict, the target Envelope's remaining, any shortfall, and the ranked reallocatable Slack — do not invent numbers.",
      "If the verdict is fits_if_reallocated and the Member approves a specific trade-off, call reallocate to move Slack from the chosen Envelope. Never reallocate without explicit approval.",
      "If the Member wants to see everything they're hoping to buy, call plan_period to test the whole wishlist by priority; optionally add_planned_purchase to record this one.",
      "Re-run evaluate_purchase or get_budget to confirm the purchase now fits.",
    ],
    tools: [
      "evaluate_purchase",
      "reallocate",
      "plan_period",
      "add_planned_purchase",
      "list_categories",
      "get_budget",
    ],
  },
  monthly_report: {
    flow: "monthly_report",
    title: "Produce a monthly report",
    overview:
      "Summarize how a Period went and answer follow-up questions conversationally, all from structured data.",
    steps: [
      "Call get_period_summary for the Period.",
      "Render the summary: spend vs budget per category, income vs spend, top merchants, and the trend vs prior Periods. Present the figures as returned.",
      "Offer follow-ups: call list_transactions or search_transactions to drill into any category or merchant the Member asks about.",
      "If the Member wants to act on what they see (e.g. adjust next month), hand off to the create_budget flow.",
    ],
    tools: ["get_period_summary", "list_transactions", "search_transactions"],
  },
};

/** Return the guide for a flow, or throw a clean error listing valid flows. */
export function getGuide(flow: string): WorkflowGuide {
  const guide = GUIDES[flow as WorkflowFlow];
  if (!guide) {
    throw new Error(
      `Unknown workflow flow "${flow}". Available flows: ${WORKFLOW_FLOWS.join(", ")}.`,
    );
  }
  return guide;
}
