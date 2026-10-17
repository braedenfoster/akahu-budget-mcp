/**
 * Money is integer minor units (cents) paired with an ISO-4217 currency
 * (ADR-0003, ADR-0005). The server owns all arithmetic; the LLM never does it.
 *
 * We deliberately do NOT define a `Money` class with operator-like helpers for
 * every read path — most call sites already hold plain cent integers from the
 * database. These helpers exist to (a) keep floats out at the boundaries where
 * dollars are entered/displayed, and (b) make cent arithmetic explicit and
 * currency-checked where amounts from different sources are combined.
 */

export const DEFAULT_CURRENCY = "NZD";

/** A guarded integer number of cents. */
export function assertCents(value: number, label = "amount"): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of cents, got ${value}`);
  }
  return value;
}

/**
 * Convert a decimal major-unit amount (e.g. dollars as entered by a human)
 * into integer cents, rounding half-up to the nearest cent. Use only at the
 * boundary where a user supplies dollars; never inside the engines.
 */
export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) {
    throw new Error(`dollars must be finite, got ${dollars}`);
  }
  // Scale then round to avoid binary-float drift (e.g. 19.99 -> 1999).
  return Math.round((dollars + Number.EPSILON) * 100);
}

/** Format integer cents as a display string, e.g. (199900, "NZD") -> "NZD 1,999.00". */
export function formatCents(cents: number, currency = DEFAULT_CURRENCY): string {
  return `${cents < 0 ? "-" : ""}${currency} ${groupedAmount(cents)}`;
}

/** Dollars for glanceable surfaces such as the phone widget: "$2,568.58", "-$213.96". */
export function formatDollars(cents: number): string {
  return `${cents < 0 ? "-" : ""}$${groupedAmount(cents)}`;
}

function groupedAmount(cents: number): string {
  assertCents(cents, "cents");
  const abs = Math.abs(cents);
  const major = Math.floor(abs / 100).toLocaleString("en-NZ");
  return `${major}.${(abs % 100).toString().padStart(2, "0")}`;
}

/** Sum a list of cent amounts, asserting each is an integer. Empty sum is 0. */
export function sumCents(amounts: number[]): number {
  let total = 0;
  for (const a of amounts) total += assertCents(a);
  return total;
}
