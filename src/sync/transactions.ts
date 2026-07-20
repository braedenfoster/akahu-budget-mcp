import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
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
  isIncome: boolean;
  raw: string;
  updatedAt: string;
}

function toRow(txn: AkahuTransaction, homeCurrency: string, nowIso: string): TxnRow {
  const amountCents = dollarsToCents(txn.amount);
  const type = txn.type ?? null;
  return {
    akahuId: txn._id,
    accountId: txn._account,
    date: txn.date.slice(0, 10),
    amountCents,
    currency: txn.currency ?? homeCurrency,
    description: txn.description ?? "",
    merchant: txn.merchant?.name ?? null,
    akahuCategoryId: txn.category?._id ?? null,
    akahuCategoryGroup: txn.category?.groups?.personal_finance?.name ?? null,
    type,
    pending: txn.pending ?? false,
    // A credit that isn't an internal transfer counts as household Income
    // (ticket 05, user story 28: captures variable/weekly income directly).
    isIncome: amountCents > 0 && type !== "TRANSFER",
    raw: JSON.stringify(txn),
    updatedAt: nowIso,
  };
}

/**
 * Pull Transactions for each Connection incrementally (from the stored cursor)
 * and upsert them keyed on Akahu's transaction id. Idempotent: re-syncing an
 * overlapping window updates rows in place and never double-counts (ADR-0005).
 * A pending transaction that later settles updates the same row (pending flag
 * flips), never a delete-and-reinsert.
 *
 * Data ingestion — not gated by read-only mode, not audited.
 */
export async function syncTransactions(
  ctx: AppContext,
  jobs: TransactionSyncJob[],
  homeCurrency = "NZD",
): Promise<TransactionSyncResult> {
  const nowIso = ctx.now().toISOString();
  let inserted = 0;
  let updated = 0;
  let settled = 0;
  let skipped = 0;

  for (const job of jobs) {
    const state = ctx.db
      .select({ cursor: syncState.cursor })
      .from(syncState)
      .where(eq(syncState.connectionId, job.connectionId))
      .get();
    let cursor: string | null = state?.cursor ?? null;
    let latest: string | null = cursor;

    // Bound the loop defensively; a household never has this many pages.
    for (let page = 0; page < 10_000; page++) {
      const result = await job.client.listTransactions({ cursor });
      ctx.db.transaction(() => {
        for (const txn of result.items) {
          const row = toRow(txn, homeCurrency, nowIso);
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
      latest = result.nextCursor ?? latest;
      if (!result.hasMore) break;
      cursor = result.nextCursor;
    }

    ctx.db
      .insert(syncState)
      .values({ connectionId: job.connectionId, cursor: latest, lastSyncedAt: nowIso })
      .onConflictDoUpdate({
        target: syncState.connectionId,
        set: { cursor: latest, lastSyncedAt: nowIso },
      })
      .run();
  }

  return { inserted, updated, settled, skipped };
}
