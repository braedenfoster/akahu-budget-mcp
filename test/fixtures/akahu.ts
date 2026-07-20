import type { AkahuAccount, AkahuClient } from "../../src/akahu/types.js";

/**
 * A fake AkahuClient for Seam 2 tests: returns recorded, sanitized payloads and
 * makes no network calls. Records call counts so tests can assert idempotency.
 */
export class FakeAkahuClient implements AkahuClient {
  public listAccountsCalls = 0;
  constructor(private accountsResponse: AkahuAccount[]) {}

  async listAccounts(): Promise<AkahuAccount[]> {
    this.listAccountsCalls++;
    return this.accountsResponse;
  }

  /** Swap the accounts payload to simulate a later sync (e.g. balance change). */
  setAccounts(accts: AkahuAccount[]): void {
    this.accountsResponse = accts;
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
