import type { AppConfig } from "../config.js";
import type { AppContext } from "../context.js";
import { LiveAkahuClient } from "../akahu/live-client.js";
import type { SeededConnection } from "../household.js";
import { SETTING_LAST_SYNC_AT, putSetting } from "../context.js";
import { syncAccounts, type AccountSyncJob } from "./accounts.js";
import { syncTransactions } from "./transactions.js";
import type { SyncResult } from "./result.js";

export type { SyncResult } from "./result.js";

/**
 * Pair each seeded Connection with a LiveAkahuClient built from its env tokens.
 * Connections whose tokens are missing from config are skipped.
 */
export function buildAccountJobs(
  seeded: SeededConnection[],
  config: AppConfig,
): AccountSyncJob[] {
  const jobs: AccountSyncJob[] = [];
  for (const s of seeded) {
    const conn = config.connections.find((c) => c.index === s.akahuIndex);
    if (!conn) continue;
    jobs.push({
      connectionId: s.connectionId,
      client: new LiveAkahuClient({ appToken: conn.appToken, userToken: conn.userToken }),
    });
  }
  return jobs;
}

/**
 * Run a full sync: pull Accounts first (Transactions reference them via FK),
 * then Transactions, then stamp `last_sync_at` so every subsequent read reports
 * fresh data-as-of. Data ingestion — not gated by read-only mode, not audited.
 */
export async function runSync(
  ctx: AppContext,
  jobs: AccountSyncJob[],
  homeCurrency = "NZD",
): Promise<SyncResult> {
  const accountResult = await syncAccounts(ctx, jobs, homeCurrency);
  const txnResult = await syncTransactions(ctx, jobs, homeCurrency);
  const stamp = ctx.now().toISOString();
  putSetting(ctx, SETTING_LAST_SYNC_AT, stamp);
  return { accounts: accountResult, transactions: txnResult, data_as_of: stamp };
}
