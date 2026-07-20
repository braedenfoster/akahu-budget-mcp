import type {
  AkahuAccount,
  AkahuClient,
  AkahuTransaction,
  AkahuTransactionsPage,
} from "../../src/akahu/types.js";

/**
 * A fake AkahuClient for Seam 2 tests: returns recorded, sanitized payloads and
 * makes no network calls. Records call counts so tests can assert idempotency.
 *
 * By default `listTransactions` ignores the cursor and returns the whole set in
 * one page (hasMore=false) — the simplest thing that exercises upsert
 * idempotency on overlapping windows. Multi-page behaviour can be simulated by
 * passing `pages`.
 */
export class FakeAkahuClient implements AkahuClient {
  public listAccountsCalls = 0;
  public listTransactionsCalls = 0;
  private txnResponse: AkahuTransaction[];
  private pages: AkahuTransaction[][] | undefined;

  constructor(
    private accountsResponse: AkahuAccount[],
    txns: AkahuTransaction[] = [],
  ) {
    this.txnResponse = txns;
  }

  async listAccounts(): Promise<AkahuAccount[]> {
    this.listAccountsCalls++;
    return this.accountsResponse;
  }

  async listTransactions(opts: { cursor: string | null }): Promise<AkahuTransactionsPage> {
    this.listTransactionsCalls++;
    if (this.pages) {
      const index = opts.cursor ? Number(opts.cursor) : 0;
      const items = this.pages[index] ?? [];
      const hasMore = index < this.pages.length - 1;
      return { items, nextCursor: hasMore ? String(index + 1) : String(index), hasMore };
    }
    return { items: this.txnResponse, nextCursor: "end", hasMore: false };
  }

  setAccounts(accts: AkahuAccount[]): void {
    this.accountsResponse = accts;
  }

  setTransactions(txns: AkahuTransaction[]): void {
    this.txnResponse = txns;
    this.pages = undefined;
  }

  setPages(pages: AkahuTransaction[][]): void {
    this.pages = pages;
  }
}

/** A sanitized recorded Akahu account (balances in dollars, as Akahu returns). */
export function sampleAccount(overrides: Partial<AkahuAccount> = {}): AkahuAccount {
  return {
    _id: "acc_everyday",
    name: "Everyday",
    type: "CHECKING",
    status: "ACTIVE",
    formatted_account: "01-0137-0000000-00",
    balance: { currency: "NZD", current: 1234.56, available: 1200.0 },
    ...overrides,
  };
}

/**
 * A sanitized recorded Akahu transaction. `amount` is signed dollars: negative
 * for spending, positive for income/credits. Provide a `group` to set the
 * Akahu personal_finance group name (the categorization seed, ADR-0007).
 */
export function sampleTransaction(overrides: {
  id: string;
  account?: string;
  date?: string;
  amount: number;
  description?: string;
  merchant?: string;
  group?: string;
  type?: string;
  pending?: boolean;
}): AkahuTransaction {
  return {
    _id: overrides.id,
    _account: overrides.account ?? "acc_everyday",
    date: `${overrides.date ?? "2026-07-10"}T00:00:00.000Z`,
    description: overrides.description ?? "Purchase",
    amount: overrides.amount,
    currency: "NZD",
    type: overrides.type ?? (overrides.amount < 0 ? "DEBIT" : "CREDIT"),
    pending: overrides.pending ?? false,
    merchant: overrides.merchant ? { name: overrides.merchant } : undefined,
    category: overrides.group
      ? { _id: `nzfcc_${overrides.group}`, groups: { personal_finance: { name: overrides.group } } }
      : undefined,
  };
}
