import type { AccountSyncResult } from "./accounts.js";
import type { TransactionSyncResult } from "./transactions.js";

/** The outcome of a full sync, returned by runSync and the `refresh` tool. */
export interface SyncResult {
  accounts: AccountSyncResult;
  transactions: TransactionSyncResult;
  data_as_of: string;
}
