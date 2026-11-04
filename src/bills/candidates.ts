import { and, eq, gte, lt } from "drizzle-orm";
import { isPurchaseSql } from "../budget/engine.js";
import type { AppContext } from "../context.js";
import {
  declinedBillCandidates,
  transactions,
  type BillAmountMode,
  type BillCadence,
  type DeclinedBillCandidate,
} from "../db/schema.js";
import { addDays, daysBetween, toUtc } from "./dates.js";
import {
  debitsPayingActiveBills,
  dueDatesBetween,
  ESTIMATE_FROM_DEBITS,
  type BillSchedule,
  MATCH_DAYS_AFTER,
  MATCH_DAYS_BEFORE,
  medianCents,
} from "./view.js";

/** Detection reads settled debits from this many days before today. */
export const LOOKBACK_DAYS = 183;
/** In a group's amounts sorted low to high, an amount more than this fraction above the one before starts a new amount cluster. */
const AMOUNT_CLUSTER_GAP = 0.25;
/** A Bill candidate needs at least this many debits, on different dates, on a steady interval. */
export const MIN_DEBITS = 3;
/** A Bill candidate's last debit is at most this many intervals before today. */
export const MAX_INTERVALS_SINCE_LAST_DEBIT = 1.5;

type CandidateCadence = Extract<BillCadence, "weekly" | "fortnightly" | "monthly">;

/** The gap in days between two debits on a steady interval, for each cadence detection proposes. */
const INTERVALS: Record<CandidateCadence, { days: number; min: number; max: number }> = {
  weekly: { days: 7, min: 6, max: 8 },
  fortnightly: { days: 14, min: 12, max: 16 },
  monthly: { days: 30, min: 26, max: 35 },
};

export interface CandidateDebit {
  id: string;
  date: string;
  amountCents: number;
  merchant: string | null;
  description: string;
}

/** A repeating debit pattern no Member has confirmed (ADR-0014). Not stored. */
export interface BillCandidate {
  /** The id of the latest supporting debit. */
  id: string;
  name: string;
  cadence: CandidateCadence;
  anchorWeekday: number | null;
  anchorDay: number | null;
  anchorDate: string | null;
  amountMode: BillAmountMode;
  amountCents: number;
  matchType: "merchant" | "description";
  matchValue: string;
  /** Newest first. */
  debits: CandidateDebit[];
}

/** The Bill candidates in the Transaction history, for a Household calendar date. */
export function detectBillCandidates(ctx: AppContext, today: string): BillCandidate[] {
  const rows = ctx.db
    .select({
      id: transactions.akahuId,
      date: transactions.date,
      amountCents: transactions.amountCents,
      merchant: transactions.merchant,
      description: transactions.description,
    })
    .from(transactions)
    .where(
      and(
        lt(transactions.amountCents, 0),
        eq(transactions.pending, false),
        isPurchaseSql,
        gte(transactions.date, addDays(today, -LOOKBACK_DAYS)),
      ),
    )
    .all()
    .map((row) => ({ ...row, amountCents: -row.amountCents }));
  const paying = debitsPayingActiveBills(ctx);
  const declined = ctx.db.select().from(declinedBillCandidates).all();
  return [...groupByMatcherKey(rows).values()]
    .flatMap(amountClusters)
    .map((cluster) => steadyCandidate(cluster, today))
    .filter((c): c is BillCandidate => c !== null)
    .filter((c) => !coveredByActiveBill(c, paying) && !declined.some((d) => isDeclined(c, d)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.amountCents - b.amountCents);
}

/** Groups by merchant, else by description: an "AP#..." automatic payment has a stable description. */
function groupByMatcherKey(debits: CandidateDebit[]): Map<string, CandidateDebit[]> {
  const groups = new Map<string, CandidateDebit[]>();
  for (const debit of debits) {
    const key = debit.merchant ? `merchant:${debit.merchant.toLowerCase()}` : `description:${debit.description.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), debit]);
  }
  return groups;
}

function amountClusters(group: CandidateDebit[]): CandidateDebit[][] {
  const sorted = [...group].sort((a, b) => a.amountCents - b.amountCents);
  const clusters: CandidateDebit[][] = [];
  let previous = 0;
  for (const debit of sorted) {
    if (clusters.length === 0 || debit.amountCents > previous * (1 + AMOUNT_CLUSTER_GAP)) clusters.push([]);
    clusters.at(-1)!.push(debit);
    previous = debit.amountCents;
  }
  return clusters;
}

/**
 * Only the cluster's latest steady run counts, so an older break (school
 * holidays) does not hide a current pattern.
 */
function steadyCandidate(cluster: CandidateDebit[], today: string): BillCandidate | null {
  const newestFirst = [...cluster].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const dates = [...new Set(newestFirst.map((d) => d.date))];
  if (dates.length < MIN_DEBITS) return null;
  const cadence = cadenceOf(daysBetween(dates[1]!, dates[0]!));
  if (!cadence) return null;
  const { days, min, max } = INTERVALS[cadence];
  let runLength = 2;
  while (runLength < dates.length) {
    const gap = daysBetween(dates[runLength]!, dates[runLength - 1]!);
    if (gap < min || gap > max) break;
    runLength++;
  }
  if (runLength < MIN_DEBITS || daysBetween(dates[0]!, today) > MAX_INTERVALS_SINCE_LAST_DEBIT * days) return null;
  const run = newestFirst.filter((d) => d.date >= dates[runLength - 1]!);
  const latest = run[0]!;
  const schedule = {
    cadence,
    anchorWeekday: cadence === "weekly" ? mostCommon(run.map((d) => toUtc(d.date).getUTCDay())) : null,
    anchorDay: cadence === "monthly" ? mostCommon(run.map((d) => toUtc(d.date).getUTCDate())) : null,
    anchorDate: cadence === "fortnightly" ? latest.date : null,
    endDate: null,
  };
  // A confirmed Bill must pay its own debits, so stop at the first date that
  // misses a proposed due date. An old miss is dropped; a pattern that drifts
  // (every 4 weeks, not monthly) keeps too few dates.
  const misses = dates.slice(0, runLength).findIndex((date) => !paysADueDate(schedule, date));
  const fitLength = misses === -1 ? runLength : misses;
  if (fitLength < MIN_DEBITS || fitLength * 2 <= runLength) return null;
  const debits = run.filter((d) => d.date >= dates[fitLength - 1]!);
  const amounts = debits.map((d) => d.amountCents);
  const fixed = amounts.every((a) => a === amounts[0]);
  return {
    id: latest.id,
    name: latest.merchant ?? latest.description,
    ...schedule,
    amountMode: fixed ? "fixed" : "estimated",
    amountCents: fixed ? amounts[0]! : medianCents(amounts.slice(0, ESTIMATE_FROM_DEBITS)),
    matchType: latest.merchant ? "merchant" : "description",
    matchValue: latest.merchant ?? latest.description,
    debits,
  };
}

function paysADueDate(schedule: BillSchedule, date: string): boolean {
  return dueDatesBetween(schedule, addDays(date, -MATCH_DAYS_AFTER), addDays(date, MATCH_DAYS_BEFORE)).length > 0;
}

/**
 * Covered when more than half of the candidate's debits pay active Bills. A
 * Bill pays one debit per occurrence, so two equal debits on each date stay a
 * candidate until two Bills cover them.
 */
function coveredByActiveBill(candidate: BillCandidate, paying: Set<string>): boolean {
  return candidate.debits.filter((d) => paying.has(d.id)).length * 2 > candidate.debits.length;
}

/** Declined when the decline has the same matcher rule and an amount inside the candidate's amount cluster. */
function isDeclined(candidate: BillCandidate, decline: DeclinedBillCandidate): boolean {
  const amounts = candidate.debits.map((d) => d.amountCents);
  return (
    decline.matchType === candidate.matchType &&
    decline.matchValue.toLowerCase() === candidate.matchValue.toLowerCase() &&
    decline.amountCents >= Math.min(...amounts) / (1 + AMOUNT_CLUSTER_GAP) &&
    decline.amountCents <= Math.max(...amounts) * (1 + AMOUNT_CLUSTER_GAP)
  );
}

function cadenceOf(gap: number): CandidateCadence | null {
  const found = Object.entries(INTERVALS).find(([, { min, max }]) => gap >= min && gap <= max);
  return found ? (found[0] as CandidateCadence) : null;
}

/** The most common value; on a tie, the one seen first. */
function mostCommon(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}
