import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { transactions } from "../db/schema.js";

const PAIR_WINDOW_DAYS = 3;

// Akahu types an automatic payment to savings as STANDING ORDER, not TRANSFER.
const TRANSFER_TYPES = new Set(["TRANSFER", "STANDING ORDER"]);

interface Leg {
  akahuId: string;
  accountId: string;
  date: string;
  amountCents: number;
  type: string | null;
  current: string | null;
}

/**
 * Re-derive every Internal transfer pair from stored Transactions (ADR-0012):
 * a debit and a credit of exactly opposite amounts on two different Household
 * Accounts, within 3 days, with at least one leg typed TRANSFER or STANDING
 * ORDER. Returns the number of Transactions whose pair changed.
 */
export function pairInternalTransfers(ctx: AppContext): number {
  const legs: Leg[] = ctx.db
    .select({
      akahuId: transactions.akahuId,
      accountId: transactions.accountId,
      date: transactions.date,
      amountCents: transactions.amountCents,
      type: transactions.type,
      current: transactions.transferPairId,
    })
    .from(transactions)
    .all();

  const pairOf = new Map<string, string>();
  for (const { debit, credit } of candidates(legs)) {
    if (pairOf.has(debit.akahuId) || pairOf.has(credit.akahuId)) continue;
    pairOf.set(debit.akahuId, credit.akahuId);
    pairOf.set(credit.akahuId, debit.akahuId);
  }

  let changed = 0;
  ctx.db.transaction(() => {
    for (const leg of legs) {
      const next = pairOf.get(leg.akahuId) ?? null;
      if (leg.current === next) continue;
      ctx.db
        .update(transactions)
        .set({ transferPairId: next })
        .where(eq(transactions.akahuId, leg.akahuId))
        .run();
      changed++;
    }
  });
  return changed;
}

interface Candidate {
  debit: Leg;
  credit: Leg;
  days: number;
}

/** Every possible pair, closest date first, then lowest id, so assignment is stable. */
function candidates(legs: Leg[]): Candidate[] {
  const creditsByAmount = new Map<number, Leg[]>();
  for (const leg of legs) {
    if (leg.amountCents <= 0) continue;
    const bucket = creditsByAmount.get(leg.amountCents) ?? [];
    bucket.push(leg);
    creditsByAmount.set(leg.amountCents, bucket);
  }
  const found: Candidate[] = [];
  for (const debit of legs) {
    if (debit.amountCents >= 0) continue;
    for (const credit of creditsByAmount.get(-debit.amountCents) ?? []) {
      if (canPair(debit, credit)) found.push({ debit, credit, days: daysBetween(debit.date, credit.date) });
    }
  }
  return found.sort(
    (a, b) =>
      a.days - b.days ||
      a.debit.akahuId.localeCompare(b.debit.akahuId) ||
      a.credit.akahuId.localeCompare(b.credit.akahuId),
  );
}

function canPair(debit: Leg, credit: Leg): boolean {
  return (
    debit.amountCents === -credit.amountCents &&
    debit.accountId !== credit.accountId &&
    daysBetween(debit.date, credit.date) <= PAIR_WINDOW_DAYS &&
    (isTransferType(debit.type) || isTransferType(credit.type))
  );
}

function isTransferType(type: string | null): boolean {
  return type !== null && TRANSFER_TYPES.has(type);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}
