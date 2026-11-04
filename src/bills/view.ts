import { and, lt } from "drizzle-orm";
import { isPurchaseSql } from "../budget/engine.js";
import { dataFreshness, householdTimezone, type AppContext } from "../context.js";
import { bills, transactions, type Bill } from "../db/schema.js";
import { buildMatcher } from "../matching/matcher.js";
import { formatDollars } from "../money.js";
import { localDate } from "../period.js";
import { addDays, daysBetween, fromUtc, toUtc } from "./dates.js";

export type BillOccurrenceState = "paid" | "upcoming" | "due" | "overdue" | "missed";

export interface BillOccurrence {
  bill_id: number;
  name: string;
  due_date: string;
  state: BillOccurrenceState;
  amount_cents: number;
  amount_display: string;
  estimated: boolean;
}

export interface BillsView {
  occurrences: BillOccurrence[];
  today: BillOccurrence[];
  next_upcoming: BillOccurrence | null;
  due_total_cents: number;
  due_total_display: string;
  data_as_of: string | null;
  stale: boolean;
}

/** An occurrence stays "due" for this many days after its due date, for bank lag. */
export const DUE_DAYS = 2;
/** After the due days, an occurrence is "overdue" up to this many days after its due date, then "missed". */
export const OVERDUE_DAYS = 5;
/** A paid occurrence stays in the week list for this many days after its due date. */
export const PAID_SHOWN_DAYS = 2;
/** The week list covers this many days before today and this many after it. */
export const WEEK_BEHIND_DAYS = 5;
export const WEEK_AHEAD_DAYS = 6;
/** A debit matches an occurrence when it lands from this many days before the due date to this many after it. */
export const MATCH_DAYS_BEFORE = 3;
export const MATCH_DAYS_AFTER = 5;
/** An estimated Bill takes the median of this many of its latest matched debits. */
export const ESTIMATE_FROM_DEBITS = 3;

/** A spend debit, with the money that left as a positive amount. */
interface Debit {
  id: string;
  date: string;
  amountCents: number;
}

interface Matches {
  paid: Map<string, Debit>;
  /** Each Bill's matched debits, newest first. */
  byBill: Map<number, Debit[]>;
}

/**
 * The Bills view for a Household calendar date (ADR-0014). Every surface must
 * call this rather than redo the date math, so Claude and the phones agree.
 */
export function computeBillsView(ctx: AppContext, today: string): BillsView {
  const { all, matches } = billsWithMatches(ctx);
  const weekStart = addDays(today, -WEEK_BEHIND_DAYS);
  const weekEnd = addDays(today, WEEK_AHEAD_DAYS);
  const occurrences = all
    .flatMap((bill) => dueDatesBetween(bill, weekStart, weekEnd).map((date) => occurrence(bill, date, today, matches)))
    .filter((o) => inWeekList(o, today))
    .sort(weekOrder);
  const dueTotal = occurrences.filter((o) => o.state !== "paid").reduce((sum, o) => sum + o.amount_cents, 0);
  return {
    occurrences,
    today: occurrences.filter((o) => o.due_date <= today),
    next_upcoming: nextUpcoming(all, today, matches),
    due_total_cents: dueTotal,
    due_total_display: formatDollars(dueTotal),
    ...dataFreshness(ctx),
  };
}

/** The ids of the debits that pay an occurrence of an active Bill. */
export function debitsPayingActiveBills(ctx: AppContext): Set<string> {
  const { all, matches } = billsWithMatches(ctx);
  return new Set(
    all
      .filter((bill) => bill.status === "active")
      .flatMap((bill) => (matches.byBill.get(bill.id) ?? []).map((d) => d.id)),
  );
}

/**
 * Each Bill's missed due dates from `from` to `until`, both inclusive, keyed by
 * Bill id. Due dates before the Bill was created are left out: a new Bill may
 * have no debits in the history yet.
 */
export function missedDueDates(ctx: AppContext, from: string, until: string, today: string): Map<number, string[]> {
  const { all, matches } = billsWithMatches(ctx);
  const timeZone = householdTimezone(ctx);
  return new Map(
    all.map((bill) => {
      const created = localDate(new Date(bill.createdAt), timeZone);
      return [
        bill.id,
        dueDatesBetween(bill, created > from ? created : from, until).filter(
          (date) => occurrence(bill, date, today, matches).state === "missed",
        ),
      ];
    }),
  );
}

function billsWithMatches(ctx: AppContext): { all: Bill[]; matches: Matches } {
  const all = ctx.db.select().from(bills).all();
  return { all, matches: matchDebits(ctx, all) };
}

/**
 * The first upcoming occurrence after today. The longest cadence is a year and
 * an early payment can skip one occurrence, so two years ahead always finds it.
 */
function nextUpcoming(all: Bill[], today: string, matches: Matches): BillOccurrence | null {
  const tomorrow = addDays(today, 1);
  const twoYearsAhead = addDays(today, 2 * 366);
  const firsts = all.flatMap((bill) =>
    dueDatesBetween(bill, tomorrow, twoYearsAhead)
      .map((date) => occurrence(bill, date, today, matches))
      .filter((o) => o.state === "upcoming")
      .slice(0, 1),
  );
  return firsts.sort(weekOrder)[0] ?? null;
}

function inWeekList(o: BillOccurrence, today: string): boolean {
  if (o.state === "paid") return daysBetween(o.due_date, today) <= PAID_SHOWN_DAYS;
  return o.state !== "missed";
}

function weekOrder(a: BillOccurrence, b: BillOccurrence): number {
  const overdueFirst = Number(b.state === "overdue") - Number(a.state === "overdue");
  return overdueFirst || a.due_date.localeCompare(b.due_date) || a.name.localeCompare(b.name);
}

function state(dueDate: string, today: string): BillOccurrenceState {
  const daysLate = daysBetween(dueDate, today);
  if (daysLate < 0) return "upcoming";
  if (daysLate <= DUE_DAYS) return "due";
  if (daysLate <= OVERDUE_DAYS) return "overdue";
  return "missed";
}

function occurrence(bill: Bill, dueDate: string, today: string, matches: Matches): BillOccurrence {
  const paid = matches.paid.get(occurrenceKey(bill.id, dueDate));
  const estimated = !paid && bill.amountMode === "estimated";
  const amount = paid?.amountCents ?? (estimated ? estimate(bill, matches) : bill.expectedAmountCents);
  return {
    bill_id: bill.id,
    name: bill.name,
    due_date: dueDate,
    state: paid ? "paid" : state(dueDate, today),
    amount_cents: amount,
    amount_display: `${estimated ? "~" : ""}${formatDollars(amount)}`,
    estimated,
  };
}

/** The median of the Bill's latest matched debits, or its expected amount before any match. */
function estimate(bill: Bill, matches: Matches): number {
  const latest = (matches.byBill.get(bill.id) ?? []).slice(0, ESTIMATE_FROM_DEBITS).map((d) => d.amountCents);
  return latest.length === 0 ? bill.expectedAmountCents : medianCents(latest);
}

export function medianCents(amounts: number[]): number {
  const sorted = [...amounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function occurrenceKey(billId: number, dueDate: string): string {
  return `${billId}:${dueDate}`;
}

/**
 * Pairs spend debits with Bill occurrences. Nothing is stored: the pairs are
 * re-derived on every build, so editing or ending a Bill needs no clean-up.
 */
function matchDebits(ctx: AppContext, all: Bill[]): Matches {
  const rows = ctx.db
    .select({
      id: transactions.akahuId,
      date: transactions.date,
      amountCents: transactions.amountCents,
      merchant: transactions.merchant,
      description: transactions.description,
      group: transactions.akahuCategoryGroup,
      type: transactions.type,
    })
    .from(transactions)
    .where(and(lt(transactions.amountCents, 0), isPurchaseSql))
    .all();
  const debits = rows.map((row) => ({ ...row, amountCents: -row.amountCents }));
  const pairs: { billId: number; key: string; debit: Debit; amountOff: number; daysOff: number }[] = [];
  for (const bill of all) {
    const rule = { matchType: bill.matchType, matchValue: bill.matchValue, targetId: bill.id, priority: 0, id: bill.id };
    const passes = buildMatcher([rule]);
    for (const debit of debits) {
      if (passes(debit) === undefined) continue;
      const dueDates = dueDatesBetween(bill, addDays(debit.date, -MATCH_DAYS_AFTER), addDays(debit.date, MATCH_DAYS_BEFORE));
      for (const dueDate of dueDates)
        pairs.push({
          billId: bill.id,
          key: occurrenceKey(bill.id, dueDate),
          debit,
          amountOff: Math.abs(bill.expectedAmountCents - debit.amountCents),
          daysOff: Math.abs(daysBetween(dueDate, debit.date)),
        });
    }
  }
  // Each debit pays at most one occurrence and each occurrence takes at most one
  // debit. The closest expected amount wins first, so two Bills from one
  // merchant on one day each take their own debit.
  pairs.sort((a, b) => a.amountOff - b.amountOff || a.daysOff - b.daysOff);
  const paid = new Map<string, Debit>();
  const byBill = new Map<number, Debit[]>();
  const used = new Set<string>();
  for (const { billId, key, debit } of pairs) {
    if (paid.has(key) || used.has(debit.id)) continue;
    paid.set(key, debit);
    used.add(debit.id);
    byBill.set(billId, [...(byBill.get(billId) ?? []), debit]);
  }
  for (const debits of byBill.values()) debits.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return { paid, byBill };
}

/** The fields that set a Bill's due dates. */
export type BillSchedule = Pick<Bill, "cadence" | "anchorWeekday" | "anchorDay" | "anchorDate" | "endDate">;

/** The Bill's due dates from `from` to `until`, both inclusive. An ended Bill has none after its end date. */
export function dueDatesBetween(bill: BillSchedule, from: string, until: string): string[] {
  const to = bill.endDate !== null && bill.endDate < until ? bill.endDate : until;
  switch (bill.cadence) {
    case "weekly":
      return everyNDays(firstWeekdayOnOrAfter(from, bill.anchorWeekday!), 7, to);
    case "fortnightly":
      return everyNDays(firstStepOnOrAfter(bill.anchorDate!, 14, from), 14, to);
    case "monthly": {
      const start = toUtc(from);
      return everyNMonths(start.getUTCFullYear(), start.getUTCMonth(), bill.anchorDay!, 1, from, to);
    }
    case "quarterly":
    case "yearly": {
      const anchor = toUtc(bill.anchorDate!);
      const step = bill.cadence === "quarterly" ? 3 : 12;
      return everyNMonths(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate(), step, from, to);
    }
  }
}

function firstWeekdayOnOrAfter(date: string, weekday: number): string {
  return addDays(date, (weekday - toUtc(date).getUTCDay() + 7) % 7);
}

/** The first date on or after `from` that is a whole number of steps from `anchor`. */
function firstStepOnOrAfter(anchor: string, step: number, from: string): string {
  const behind = daysBetween(anchor, from);
  return addDays(anchor, Math.ceil(behind / step) * step);
}

function everyNDays(first: string, step: number, to: string): string[] {
  const dates: string[] = [];
  for (let date = first; date <= to; date = addDays(date, step)) dates.push(date);
  return dates;
}

/**
 * Dates every `step` months from (year, month0), on `day` or the month's last
 * day. Each date is measured from the anchor month, so the 31st returns after a
 * shorter month.
 */
function everyNMonths(year: number, month0: number, day: number, step: number, from: string, to: string): string[] {
  const start = toUtc(from);
  const monthsBehind = (start.getUTCFullYear() - year) * 12 + start.getUTCMonth() - month0;
  const dates: string[] = [];
  for (let k = Math.floor(monthsBehind / step); ; k++) {
    const date = clampedDate(year, month0 + k * step, day);
    if (date > to) break;
    if (date >= from) dates.push(date);
  }
  return dates;
}

function clampedDate(year: number, month0: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return fromUtc(new Date(Date.UTC(year, month0, Math.min(day, lastDay))));
}
