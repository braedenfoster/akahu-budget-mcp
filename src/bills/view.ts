import { dataFreshness, type AppContext } from "../context.js";
import { bills, type Bill } from "../db/schema.js";
import { formatDollars } from "../money.js";

export type BillOccurrenceState = "upcoming" | "due" | "overdue" | "missed";

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
/** The week list covers this many days before today and this many after it. */
export const WEEK_BEHIND_DAYS = 5;
export const WEEK_AHEAD_DAYS = 6;

/**
 * The Bills view for a Household calendar date (ADR-0014). Every surface must
 * call this rather than redo the date math, so Claude and the phones agree.
 */
export function computeBillsView(ctx: AppContext, today: string): BillsView {
  const all = ctx.db.select().from(bills).all();
  const weekStart = addDays(today, -WEEK_BEHIND_DAYS);
  const weekEnd = addDays(today, WEEK_AHEAD_DAYS);
  const occurrences = all
    .flatMap((bill) => dueDatesBetween(bill, weekStart, weekEnd).map((date) => occurrence(bill, date, today)))
    .filter((o) => o.state !== "missed")
    .sort(weekOrder);
  const dueTotal = occurrences.reduce((sum, o) => sum + o.amount_cents, 0);
  return {
    occurrences,
    today: occurrences.filter((o) => o.due_date <= today),
    next_upcoming: nextUpcoming(all, today),
    due_total_cents: dueTotal,
    due_total_display: formatDollars(dueTotal),
    ...dataFreshness(ctx),
  };
}

/** The first occurrence after today. The longest cadence is a year, so a year ahead always finds it. */
function nextUpcoming(all: Bill[], today: string): BillOccurrence | null {
  const tomorrow = addDays(today, 1);
  const yearAhead = addDays(today, 366);
  const firsts = all.flatMap((bill) =>
    dueDatesBetween(bill, tomorrow, yearAhead)
      .slice(0, 1)
      .map((date) => occurrence(bill, date, today)),
  );
  return firsts.sort(weekOrder)[0] ?? null;
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

function occurrence(bill: Bill, dueDate: string, today: string): BillOccurrence {
  return {
    bill_id: bill.id,
    name: bill.name,
    due_date: dueDate,
    state: state(dueDate, today),
    amount_cents: bill.expectedAmountCents,
    amount_display: formatDollars(bill.expectedAmountCents),
    estimated: false,
  };
}

/** The Bill's due dates from `from` to `until`, both inclusive. An ended Bill has none after its end date. */
function dueDatesBetween(bill: Bill, from: string, until: string): string[] {
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

function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}
