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
      "Call get_budget for the Period to show current allocations, spend so far, actual/expected income (with the per-Stream breakdown in income.by_stream), and Household headroom.",
      "Call list_income_streams to ground expected income in what actually arrived, broken down by Income Stream (e.g. Salary, PPL). Flag any Stream the Member says is about to change — e.g. a Paid Parental Leave stream ending — so expected income reflects it rather than last month's total.",
      "Confirm the expected income with the Member, then call set_expected_income.",
      "If the Member names a Budget Category that list_categories does not show, ask the Member whether it is Committed or Flexible, then call manage_categories with action create, the name, and that kind.",
      "For each Budget Category the Member names, call set_allocation with the agreed amount (convert dollars to integer cents before calling).",
      "Call get_budget again, before the Member confirms the allocations. Show the Committed and Flexible totals from allocated_by_kind (committed_cents, flexible_cents) and the Spending allowance from spending_allowance (amount_cents, per_week_cents), as returned. Do not add up Envelopes yourself.",
      "If the Member wants a different Spending allowance, change the Committed or Flexible allocations with set_allocation. Then repeat the previous step.",
      "Read household_headroom_cents from the same get_budget result. If it is negative, tell the Member they have allocated more than they expect to earn and offer to trim an Envelope; otherwise confirm the budget is set.",
    ],
    tools: [
      "get_budget",
      "create_budget_for_period",
      "set_expected_income",
      "set_allocation",
      "list_categories",
      "manage_categories",
      "list_income_streams",
    ],
  },
  review_spending: {
    flow: "review_spending",
    title: "Review spending and clean up categorization",
    overview:
      "Walk the Member through where the money went this Period, clear anything Uncategorized, tidy up how income is classified into Income Streams, spot Envelopes that are overspent, and keep the Bills list current.",
    steps: [
      "Call get_budget for the Period and highlight any Envelope whose remaining_cents is negative (overspent).",
      "Call list_uncategorized for the Period. For each item, propose a Budget Category based on its merchant/description.",
      "If the Member wants a Budget Category that does not exist yet, ask the Member whether it is Committed or Flexible, then call manage_categories with action create, the name, and that kind.",
      "When the Member agrees on a one-off, call categorize_transaction. When it should stick for the future, call set_category_rule (with backfill) instead.",
      "Now do the income side: call list_unclassified_income for the Period. It lists positive credits not yet in a named Income Stream (largest first, transfers flagged) — the safety net that stops income going missing, including a partner's pay that arrives as a TRANSFER.",
      "For each one, agree a Stream with the Member. For a recurring credit, call set_income_rule (with backfill) so it — and its history — classify to that Stream; for a one-off, or to mark something explicitly not income (e.g. a refund), call classify_income. Create Streams as needed with manage_income_streams.",
      "Call income_coverage to check each connected Account received income as expected; a flagged (zero-income) Account may mean income is landing somewhere the app can't see.",
      "Now check the Bills. Call list_bills with the Period. For each Bill with missed_due_dates, tell the Member the due dates that had no debit, then ask the Member whether the Bill has ended.",
      "If the Member says a Bill has ended, call manage_bills with action end and the Bill id. Give end_date if the Member knows it; otherwise it defaults to today. If the Bill continues, ask whether its due day or matcher rule is wrong, and correct it with manage_bills action edit.",
      "Call get_upcoming_bills. For each overdue occurrence, tell the Member that its debit has not arrived and ask the Member to check the Account. Do not end a Bill because of one overdue occurrence.",
      "Call list_bill_candidates. For each Bill candidate, show the proposed name, cadence, due day, amount and supporting debits, then ask the Member to confirm or decline it.",
      "If the Member confirms a Bill candidate, call manage_bills with action confirm, the candidate_id, and any name, cadence, anchor or amount the Member changes. If the Member declines it, call manage_bills with action decline and the candidate_id. Do not confirm or decline without the Member's answer.",
      "Call list_transactions or search_transactions if the Member wants to drill into a specific Envelope or merchant.",
      "Re-run get_budget to show the cleaned-up picture (including income.by_stream).",
    ],
    tools: [
      "get_budget",
      "list_uncategorized",
      "manage_categories",
      "categorize_transaction",
      "set_category_rule",
      "list_unclassified_income",
      "set_income_rule",
      "classify_income",
      "manage_income_streams",
      "income_coverage",
      "list_bills",
      "get_upcoming_bills",
      "list_bill_candidates",
      "manage_bills",
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
      "Ask for the amount and the target Budget Category (call list_categories if the Member is unsure). If the Member will fund the purchase from savings, the target is Home projects.",
      "Call evaluate_purchase with the amount in cents and the category. Report the verdict, the target Envelope's remaining, any shortfall, and the ranked reallocatable Slack — do not invent numbers.",
      "If the verdict is fits_if_reallocated and the Member approves a specific trade-off, call reallocate to move Slack from the chosen Envelope. Never reallocate without explicit approval. Skip this step for a savings-funded purchase.",
      "If the purchase is savings-funded and list_categories does not show Home projects, ask the Member whether it is Committed or Flexible. Recommend Committed, so the purchase does not reduce the Spending allowance. Then call manage_categories with action create, the name Home projects, and that kind.",
      "For a savings-funded purchase, call set_allocation on Home projects after the Member approves and before the payment goes out. Use the Period in which the payment will land. Without this allocation, the spend drives the Spending allowance far negative.",
      "Read the Home projects allocation for that Period from get_budget's envelopes. If it is 0, set amount_cents to the purchase amount in cents. Otherwise ask the Member for the new total and convert it to cents.",
      "Tell the Member that the Home projects allocation lowers Household headroom for that Period, and can make it negative, because savings are not Income.",
      "If the Member wants to see everything they're hoping to buy, call plan_period to test the whole wishlist by priority; optionally add_planned_purchase to record this one.",
      "Re-run evaluate_purchase or get_budget to confirm the purchase now fits.",
      "After a savings-funded payment syncs, find it with search_transactions. If it is not in Home projects, call categorize_transaction to move it there.",
    ],
    tools: [
      "evaluate_purchase",
      "reallocate",
      "set_allocation",
      "plan_period",
      "add_planned_purchase",
      "list_categories",
      "manage_categories",
      "search_transactions",
      "categorize_transaction",
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
      "Render the summary: spend vs budget per category, income vs spend (with the per-Stream breakdown in income_vs_spend.by_stream), top merchants, and the trend vs prior Periods. Present the figures as returned. Call out any Income Stream that has moved notably — especially one falling toward zero (e.g. a Paid Parental Leave stream ending).",
      "Offer follow-ups: call list_transactions or search_transactions to drill into any category or merchant the Member asks about, or income_coverage to see which Accounts income landed in.",
      "If the Member wants to act on what they see (e.g. adjust next month), hand off to the create_budget flow.",
    ],
    tools: ["get_period_summary", "list_transactions", "search_transactions", "income_coverage"],
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
