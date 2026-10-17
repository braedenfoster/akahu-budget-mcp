/**
 * A Period is a calendar month expressed as an explicit start/end date range,
 * governed by `budget_month_start_day` (ADR-0004, CONTEXT.md). Default start day
 * 1 makes a Period a plain calendar month; a later value shifts the window so
 * pay-cycle Periods become config, not a schema change.
 *
 * All dates here are Household calendar dates as "YYYY-MM-DD" strings. The math
 * runs in UTC so day counts ignore daylight saving, and comparisons are plain
 * string comparisons.
 */

export interface Period {
  /** "YYYY-MM" of the Period's start date; the canonical key for a Period. */
  key: string;
  /** Inclusive first calendar date, "YYYY-MM-DD". */
  startDate: string;
  /** Inclusive last calendar date, "YYYY-MM-DD". */
  endDate: string;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function ymd(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

/** Number of days in a given (year, 0-indexed month). */
function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/**
 * The Period containing `date` (a "YYYY-MM-DD" or ISO string) for the given
 * start day. E.g. startDay=15 and date 2026-07-20 -> [2026-07-15, 2026-08-14];
 * date 2026-07-10 -> [2026-06-15, 2026-07-14].
 */
export function periodForDate(date: string, startDay: number): Period {
  const d = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  const year = d.getUTCFullYear();
  const month0 = d.getUTCMonth();
  const day = d.getUTCDate();
  // Anchor to the start-day boundary; step back a month if before it.
  let anchorYear = year;
  let anchorMonth0 = month0;
  if (day < startDay) {
    anchorMonth0 -= 1;
    if (anchorMonth0 < 0) {
      anchorMonth0 = 11;
      anchorYear -= 1;
    }
  }
  return periodForMonth(anchorYear, anchorMonth0 + 1, startDay);
}

/**
 * The Period whose start falls in the given calendar month (1-indexed). The
 * key is always the start month, so `periodForMonth(2026, 7, 15)` has key
 * "2026-07" and range [2026-07-15, 2026-08-14].
 */
export function periodForMonth(year: number, month1: number, startDay: number): Period {
  const month0 = month1 - 1;
  const clampedStart = Math.min(startDay, daysInMonth(year, month0));
  const startDate = ymd(year, month0, clampedStart);

  if (startDay === 1) {
    const endDate = ymd(year, month0, daysInMonth(year, month0));
    return { key: `${year}-${pad2(month1)}`, startDate, endDate };
  }

  // End = day before the next Period's start.
  let nextYear = year;
  let nextMonth0 = month0 + 1;
  if (nextMonth0 > 11) {
    nextMonth0 = 0;
    nextYear += 1;
  }
  const nextStartDay = Math.min(startDay, daysInMonth(nextYear, nextMonth0));
  const nextStart = new Date(Date.UTC(nextYear, nextMonth0, nextStartDay));
  const end = new Date(nextStart.getTime() - 24 * 60 * 60 * 1000);
  const endDate = ymd(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return { key: `${year}-${pad2(month1)}`, startDate, endDate };
}

/** Parse a "YYYY-MM" Period key into its range for the given start day. */
export function periodFromKey(key: string, startDay: number): Period {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid period key "${key}" (expected YYYY-MM)`);
  return periodForMonth(Number(match[1]), Number(match[2]), startDay);
}

/** The Period immediately before the given one. */
export function previousPeriod(period: Period, startDay: number): Period {
  const parts = period.key.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return periodForMonth(prevYear, prevMonth, startDay);
}

/** The standard `{ key, start, end }` view of a Period used in tool outputs. */
export function periodView(period: Period): { key: string; start: string; end: string } {
  return { key: period.key, start: period.startDate, end: period.endDate };
}

/** Whole days remaining in the Period, inclusive of `asOf` (>= 0). */
export function daysLeftInPeriod(period: Period, asOf: string): number {
  const asOfDate = new Date(`${asOf.slice(0, 10)}T00:00:00.000Z`);
  const end = new Date(`${period.endDate}T00:00:00.000Z`);
  const diff = Math.floor((end.getTime() - asOfDate.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff + 1);
}

/** Number of calendar days in the Period. */
export function periodLengthDays(period: Period): number {
  return daysLeftInPeriod(period, period.startDate);
}

/** The Household time zone: `raw` if it is a known IANA zone, else Pacific/Auckland. */
export function householdTimezoneOrDefault(raw: string | undefined): string {
  if (!raw) return "Pacific/Auckland";
  try {
    new Intl.DateTimeFormat("en-NZ", { timeZone: raw });
    return raw;
  } catch {
    return "Pacific/Auckland";
  }
}

/** The calendar date ("YYYY-MM-DD") of `instant` in the given IANA time zone. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
