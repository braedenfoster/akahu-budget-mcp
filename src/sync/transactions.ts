import { eq } from "drizzle-orm";
import { householdTimezone, type AppContext } from "../context.js";
import { localDate } from "../period.js";
import { dollarsToCents } from "../money.js";
import { accounts, syncState, transactions } from "../db/schema.js";
import type { AkahuClient, AkahuTransaction } from "../akahu/types.js";

export interface TransactionSyncJob {
  connectionId: number;
  client: AkahuClient;
}

export interface TransactionSyncResult {
  inserted: number;
  updated: number;
  /** Transactions that flipped from pending to settled on this sync. */
  settled: number;
  /** Transactions skipped because their Account isn't cached yet. */
  skipped: number;
}

interface TxnRow {
  akahuId: string;
  accountId: string;
  date: string;
  amountCents: number;
  currency: string;
  description: string;
  merchant: string | null;
  akahuCategoryId: string | null;
  akahuCategoryGroup: string | null;
  type: string | null;
  pending: boolean;
  raw: string;
  updatedAt: string;
}

function toRow(
  txn: AkahuTransaction,
  homeCurrency: string,
  timeZone: string,
  nowIso: string,
): TxnRow {
  const amountCents = dollarsToCents(txn.amount);
  const type = txn.type ?? null;
  // `is_income` and `income_stream_id` are NOT set here: Income is decided by
  // the classification pass (ADR-0009), which runs after every sync. Leaving
  // them out of the upsert set preserves an existing row's classification until
  // reclassification re-derives it.
  return {
    akahuId: txn._id,
    accountId: txn._account,
    // Akahu sends the bank's calendar date as local midnight in UTC.
    date: localDate(new Date(txn.date), timeZone),
    amountCents,
    currency: txn.currency ?? homeCurrency,
    description: txn.description ?? "",
    merchant: txn.merchant?.name ?? null,
    akahuCategoryId: txn.category?._id ?? null,
    akahuCategoryGroup: txn.category?.groups?.personal_finance?.name ?? null,
    type,
    pending: txn.pending ?? false,
    raw: JSON.stringify(txn),
    updatedAt: nowIso,
  };
}

/**
 * How far back before the last successful sync each incremental run reaches.
 *
 * Banks post transactions late and pending rows settle days after they appear,
 * so a window that started exactly at the last sync would miss them. The upsert
 * is keyed on Akahu's id, so re-seeing a transaction is free.
 */
export const SYNC_OVERLAP_DAYS = 7;

/** Shift an ISO instant back by whole days, staying in UTC. */
function isoMinusDays(iso: string, days: number): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/**
 * Pull Transactions for each Connection and upsert them keyed on Akahu's
 * transaction id. Idempotent: re-syncing an overlapping window updates rows in
 * place and never double-counts (ADR-0005). A pending transaction that later
 * settles updates the same row (pending flag flips), never a delete-and-reinsert.
 *
 * Incremental runs are driven by a DATE WINDOW, never by a stored cursor. Akahu
 * pages newest → oldest, so the cursor left over from a completed backfill
 * points at the oldest edge of history; persisting and resuming it replays that
 * same ancient page forever while reporting success. The cursor is therefore
 * scoped to a single run, and `sync_state.cursor` is deliberately kept null.
 *
 * Data ingestion — not gated by read-only mode, not audited.
 */
export async function syncTransactions(
  ctx: AppContext,
  jobs: TransactionSyncJob[],
  homeCurrency = "NZD",
): Promise<TransactionSyncResult> {
  const nowIso = ctx.now().toISOString();
  const timeZone = householdTimezone(ctx);
  let inserted = 0;
  let updated = 0;
  let settled = 0;
  let skipped = 0;

  for (const job of jobs) {
    const state = ctx.db
      .select({ lastSyncedAt: syncState.lastSyncedAt })
      .from(syncState)
      .where(eq(syncState.connectionId, job.connectionId))
      .get();

    // No watermark yet means this Connection has never synced: walk all history.
    // Otherwise ask for everything since the last run, less the overlap.
    const start = state?.lastSyncedAt
      ? isoMinusDays(state.lastSyncedAt, SYNC_OVERLAP_DAYS)
      : null;

    // Pagination only. Reset every run and never persisted (see the note above).
    let cursor: string | null = null;

    // Bound the loop defensively; a household never has this many pages.
    for (let page = 0; page < 10_000; page++) {
      const result = await job.client.listTransactions({ start, cursor });
      ctx.db.transaction(() => {
        for (const txn of result.items) {
          const row = toRow(txn, homeCurrency, timeZone, nowIso);
          const accountExists = ctx.db
            .select({ id: accounts.akahuId })
            .from(accounts)
            .where(eq(accounts.akahuId, row.accountId))
            .get();
          if (!accountExists) {
            skipped++;
            continue;
          }
          const existing = ctx.db
            .select({ pending: transactions.pending })
            .from(transactions)
            .where(eq(transactions.akahuId, row.akahuId))
            .get();
          ctx.db
            .insert(transactions)
            .values(row)
            .onConflictDoUpdate({ target: transactions.akahuId, set: row })
            .run();
          if (!existing) {
            inserted++;
          } else {
            updated++;
            if (existing.pending && !row.pending) settled++;
          }
        }
      });
      // Stop at the end of the window, or if a page claims more but hands back
      // no cursor to follow — otherwise the loop would refetch page 1 forever.
      if (!result.hasMore || !result.nextCursor) break;
      cursor = result.nextCursor;
    }

    // Advance the watermark only after the window drained without throwing: a
    // failed run leaves the old value so the next run re-covers the same ground.
    ctx.db
      .insert(syncState)
      .values({ connectionId: job.connectionId, cursor: null, lastSyncedAt: nowIso })
      .onConflictDoUpdate({
        target: syncState.connectionId,
        set: { cursor: null, lastSyncedAt: nowIso },
      })
      .run();
  }

  return { inserted, updated, settled, skipped };
}
