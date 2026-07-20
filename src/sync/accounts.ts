import type { AppContext } from "../context.js";
import { dollarsToCents } from "../money.js";
import { accounts, balanceSnapshots } from "../db/schema.js";
import type { AkahuAccount, AkahuClient } from "../akahu/types.js";

/** Pair a Connection with the live (or fake) client that can read its Accounts. */
export interface AccountSyncJob {
  connectionId: number;
  client: AkahuClient;
}

export interface AccountSyncResult {
  accountsUpserted: number;
  snapshotsWritten: number;
}

function balanceCents(acct: AkahuAccount): number {
  const current = acct.balance?.current;
  return typeof current === "number" ? dollarsToCents(current) : 0;
}

function accountCurrency(acct: AkahuAccount, homeCurrency: string): string {
  return acct.balance?.currency ?? homeCurrency;
}

/**
 * Pull Accounts for each Connection into sqlite and capture one balance
 * snapshot per Account for today (ctx clock). Upserts are keyed on Akahu's
 * account id; snapshots are keyed on (account, date) so a same-day re-sync
 * updates rather than duplicates. Runs inside one transaction per job.
 *
 * This is data ingestion, not a user mutation, so it does not route through the
 * write wrapper (no audit row, not blocked by read-only mode).
 */
export async function syncAccounts(
  ctx: AppContext,
  jobs: AccountSyncJob[],
  homeCurrency = "NZD",
): Promise<AccountSyncResult> {
  const now = ctx.now();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  let accountsUpserted = 0;
  let snapshotsWritten = 0;

  for (const job of jobs) {
    const remoteAccounts = await job.client.listAccounts();
    ctx.db.transaction(() => {
      for (const acct of remoteAccounts) {
        const cents = balanceCents(acct);
        const currency = accountCurrency(acct, homeCurrency);
        ctx.db
          .insert(accounts)
          .values({
            akahuId: acct._id,
            connectionId: job.connectionId,
            name: acct.name ?? acct._id,
            type: acct.type ?? null,
            formattedAccount: acct.formatted_account ?? null,
            balanceCents: cents,
            currency,
            raw: JSON.stringify(acct),
            updatedAt: nowIso,
          })
          .onConflictDoUpdate({
            target: accounts.akahuId,
            set: {
              connectionId: job.connectionId,
              name: acct.name ?? acct._id,
              type: acct.type ?? null,
              formattedAccount: acct.formatted_account ?? null,
              balanceCents: cents,
              currency,
              raw: JSON.stringify(acct),
              updatedAt: nowIso,
            },
          })
          .run();
        accountsUpserted++;

        ctx.db
          .insert(balanceSnapshots)
          .values({
            accountId: acct._id,
            date: today,
            balanceCents: cents,
            currency,
            capturedAt: nowIso,
          })
          .onConflictDoUpdate({
            target: [balanceSnapshots.accountId, balanceSnapshots.date],
            set: { balanceCents: cents, currency, capturedAt: nowIso },
          })
          .run();
        snapshotsWritten++;
      }
    });
  }

  return { accountsUpserted, snapshotsWritten };
}
