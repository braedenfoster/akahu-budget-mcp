import type { BudgetSnapshot } from "../budget/engine.js";

export type FitVerdict = "fits" | "fits_if_reallocated" | "doesnt_fit";

export interface ReallocatableSlack {
  category_id: number;
  category: string;
  slack_cents: number;
}

export interface PurchaseEvaluation {
  amount_cents: number;
  target: { category_id: number; category: string; remaining_cents: number } | null;
  verdict: FitVerdict;
  shortfall_cents: number;
  ranked_reallocatable_slack: ReallocatableSlack[];
  household_headroom_cents: number;
  days_left: number;
}

/**
 * Pure, read-only purchase verdict over a computed Budget snapshot (ADR-0003).
 * The server decides the numbers (does it fit, by how much, what slack exists);
 * the LLM decides what to do about it.
 *
 * With a target category, the baseline capacity is that Envelope's remaining,
 * and unassigned Household headroom can help close a shortfall. With no target
 * category, the baseline is Household headroom alone (user story: "evaluates
 * against Household headroom only").
 */
export function evaluatePurchase(
  snapshot: BudgetSnapshot,
  amountCents: number,
  categoryId: number | undefined,
  daysLeft: number,
): PurchaseEvaluation {
  const headroom = snapshot.household_headroom_cents;

  const targetEnvelope =
    categoryId === undefined
      ? undefined
      : snapshot.envelopes.find((e) => e.category_id === categoryId);

  // Envelopes we could move slack out of: everything except the target, with
  // positive slack, ranked most-slack-first.
  const ranked: ReallocatableSlack[] = snapshot.envelopes
    .filter((e) => e.category_id !== categoryId && e.slack_cents > 0)
    .sort((a, b) => b.slack_cents - a.slack_cents)
    .map((e) => ({ category_id: e.category_id, category: e.category, slack_cents: e.slack_cents }));
  const slackAvailable = ranked.reduce((s, r) => s + r.slack_cents, 0);

  let target: PurchaseEvaluation["target"] = null;
  let baseline: number;
  let coverBeyondBaseline: number;

  if (categoryId !== undefined) {
    // remaining is 0 if the target category has no Envelope/spend this Period.
    const remaining = targetEnvelope?.remaining_cents ?? 0;
    target = {
      category_id: categoryId,
      category: targetEnvelope?.category ?? `#${categoryId}`,
      remaining_cents: remaining,
    };
    baseline = remaining;
    coverBeyondBaseline = slackAvailable + Math.max(0, headroom);
  } else {
    baseline = headroom;
    coverBeyondBaseline = slackAvailable;
  }

  let verdict: FitVerdict;
  let shortfall = 0;
  if (amountCents <= baseline) {
    verdict = "fits";
  } else {
    shortfall = amountCents - baseline;
    verdict = coverBeyondBaseline >= shortfall ? "fits_if_reallocated" : "doesnt_fit";
  }

  return {
    amount_cents: amountCents,
    target,
    verdict,
    shortfall_cents: shortfall,
    ranked_reallocatable_slack: ranked,
    household_headroom_cents: headroom,
    days_left: daysLeft,
  };
}
