/**
 * The Akahu client port (Seam 2). The sync engine depends on this interface,
 * never the concrete HTTP client, so tests drive it with sanitized recorded
 * responses and no network access (spec: Testing Decisions).
 *
 * Money from Akahu arrives in MAJOR units (dollars) as numbers; the sync engine
 * converts to integer cents at the boundary. Types below mirror only the fields
 * we consume, plus an index signature so the full payload can be retained raw.
 */

export interface AkahuBalance {
  currency?: string;
  /** Current balance in major units (dollars). */
  current?: number;
  /** Available balance in major units (dollars). */
  available?: number;
  [key: string]: unknown;
}

export interface AkahuAccount {
  _id: string;
  name?: string;
  type?: string;
  status?: string;
  formatted_account?: string;
  balance?: AkahuBalance;
  [key: string]: unknown;
}

/** One Member's Akahu access. Constructed per Connection. */
export interface AkahuClient {
  /** List all Accounts visible to this Connection. */
  listAccounts(): Promise<AkahuAccount[]>;
}
