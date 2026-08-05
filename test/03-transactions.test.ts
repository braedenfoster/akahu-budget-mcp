import { describe, expect, it } from "vitest";
import { syncState, transactions } from "../src/db/schema.js";
import { syncAccounts } from "../src/sync/accounts.js";
import { syncTransactions } from "../src/sync/transactions.js";
import { runCategorization } from "../src/categorization/engine.js";
import {
  listTransactionsTool,
  refreshTool,
  searchTransactionsTool,
} from "../src/tools/transactions.js";
import { invokeTool } from "../src/tools/types.js";
import { putSetting, SETTING_LAST_SYNC_AT } from "../src/context.js";
import {
  FakeAkahuClient,
  HistoryAkahuClient,
  sampleAccount,
  sampleTransaction,
} from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";
import type { AppContext } from "../src/context.js";

async function seedAccountAnd(ctx: AppContext, txns = [] as ReturnType<typeof sampleTransaction>[]) {
  const connectionId = seedConnection(ctx);
  const client = new FakeAkahuClient([sampleAccount()], txns);
  await syncAccounts(ctx, [{ connectionId, client }]);
  return { connectionId, client };
}

describe("ticket 03 — transaction sync invariants (Seam 2)", () => {
  it("re-syncing an overlapping window never double-counts", async () => {
    const ctx = testContext();
    const t1 = sampleTransaction({ id: "trans_1", amount: -12.5, merchant: "Countdown" });
    const t2 = sampleTransaction({ id: "trans_2", amount: -30.0, merchant: "Z Energy" });
    const { connectionId, client } = await seedAccountAnd(ctx, [t1, t2]);

    const first = await syncTransactions(ctx, [{ connectionId, client }]);
    expect(first).toMatchObject({ inserted: 2, updated: 0 });

    // Overlapping re-sync: same two ids returned again.
    const second = await syncTransactions(ctx, [{ connectionId, client }]);
    expect(second).toMatchObject({ inserted: 0, updated: 2 });

    expect(ctx.db.select().from(transactions).all()).toHaveLength(2);
  });

  it("picks up new transactions after a completed backfill (no frozen cursor)", async () => {
    // Regression: the nightly sync persisted the pagination cursor from the end
    // of the initial backfill. Akahu pages newest → oldest, so that cursor
    // pointed at the OLDEST page of history. Every later run replayed that same
    // ancient page, reported "0 new transactions", and never advanced.
    const ctx = testContext("2026-08-06T09:00:00.000Z");
    const connectionId = seedConnection(ctx);
    const client = new HistoryAkahuClient(
      [sampleAccount()],
      [
        sampleTransaction({ id: "old_1", date: "2024-10-09", amount: -5 }),
        sampleTransaction({ id: "old_2", date: "2024-10-11", amount: -6 }),
        sampleTransaction({ id: "old_3", date: "2024-10-13", amount: -7 }),
        sampleTransaction({ id: "jul_1", date: "2026-07-21", amount: -8 }),
      ],
    );
    await syncAccounts(ctx, [{ connectionId, client }]);

    const backfill = await syncTransactions(ctx, [{ connectionId, client }]);
    expect(backfill.inserted).toBe(4);

    // The bank posts August transactions after the backfill completed.
    client.addTransactions([
      sampleTransaction({ id: "aug_1", date: "2026-08-03", amount: -20 }),
      sampleTransaction({ id: "aug_2", date: "2026-08-05", amount: -30 }),
    ]);

    const nightly = await syncTransactions(ctx, [{ connectionId, client }]);

    expect(nightly.inserted).toBe(2);
    const ids = ctx.db.select().from(transactions).all().map((r) => r.akahuId);
    expect(ids).toContain("aug_1");
    expect(ids).toContain("aug_2");
  });

  it("syncs forward from a dated window with overlap, not from a stored cursor", async () => {
    const ctx = testContext("2026-08-06T09:00:00.000Z");
    const connectionId = seedConnection(ctx);
    const client = new HistoryAkahuClient([sampleAccount()], [
      sampleTransaction({ id: "t_1", date: "2026-08-01", amount: -5 }),
    ]);
    await syncAccounts(ctx, [{ connectionId, client }]);

    // First run has no watermark: full backfill, so no start filter.
    await syncTransactions(ctx, [{ connectionId, client }]);
    expect(client.startsRequested[0]).toBeNull();

    // Second run asks for a window that reaches back before the last sync, so
    // late-posted and newly-settled transactions are re-seen.
    await syncTransactions(ctx, [{ connectionId, client }]);
    const start = client.startsRequested[1];
    expect(start).not.toBeNull();
    expect(new Date(start as string).getTime()).toBeLessThan(
      new Date("2026-08-06T09:00:00.000Z").getTime(),
    );

    // No pagination cursor is carried between runs.
    expect(ctx.db.select().from(syncState).get()?.cursor).toBeNull();
  });

  it("a pending transaction that settles updates in place", async () => {
    const ctx = testContext();
    const pending = sampleTransaction({ id: "trans_1", amount: -40.0, pending: true });
    const { connectionId, client } = await seedAccountAnd(ctx, [pending]);

    await syncTransactions(ctx, [{ connectionId, client }]);
    expect(ctx.db.select().from(transactions).get()?.pending).toBe(true);

    client.setTransactions([sampleTransaction({ id: "trans_1", amount: -40.0, pending: false })]);
    const result = await syncTransactions(ctx, [{ connectionId, client }]);

    expect(result).toMatchObject({ inserted: 0, updated: 1, settled: 1 });
    expect(ctx.db.select().from(transactions).all()).toHaveLength(1);
    expect(ctx.db.select().from(transactions).get()?.pending).toBe(false);
  });

  it("pages through multiple cursor pages", async () => {
    const ctx = testContext();
    const { connectionId, client } = await seedAccountAnd(ctx);
    client.setPages([
      [sampleTransaction({ id: "trans_1", amount: -1 })],
      [sampleTransaction({ id: "trans_2", amount: -2 })],
      [sampleTransaction({ id: "trans_3", amount: -3 })],
    ]);
    const result = await syncTransactions(ctx, [{ connectionId, client }]);
    expect(result.inserted).toBe(3);
    expect(ctx.db.select().from(transactions).all()).toHaveLength(3);
  });

  it("sync no longer guesses income; the classification pass sets is_income (ADR-0009)", async () => {
    const ctx = testContext();
    const salary = sampleTransaction({ id: "t_pay", amount: 2500, description: "Payroll" });
    const spend = sampleTransaction({ id: "t_buy", amount: -50 });
    const xfer = sampleTransaction({ id: "t_xfer", amount: 500, type: "TRANSFER" });
    const { connectionId, client } = await seedAccountAnd(ctx, [salary, spend, xfer]);
    await syncTransactions(ctx, [{ connectionId, client }]);

    // Sync itself sets nothing: is_income is derived, not heuristic.
    const afterSync = Object.fromEntries(
      ctx.db.select().from(transactions).all().map((r) => [r.akahuId, r.isIncome]),
    );
    expect(afterSync).toEqual({ t_pay: false, t_buy: false, t_xfer: false });

    // The classification pass routes the positive non-transfer credit into the
    // Unclassified income fallback (preserving the old total); the transfer and
    // the debit are not Income.
    runCategorization(ctx);
    const afterClassify = Object.fromEntries(
      ctx.db.select().from(transactions).all().map((r) => [r.akahuId, r.isIncome]),
    );
    expect(afterClassify).toEqual({ t_pay: true, t_buy: false, t_xfer: false });
  });
});

describe("ticket 03 — list/search (Seam 1)", () => {
  async function seeded() {
    const ctx = testContext();
    const txns = [
      sampleTransaction({ id: "t1", date: "2026-07-05", amount: -25.0, merchant: "Countdown", description: "Groceries" }),
      sampleTransaction({ id: "t2", date: "2026-07-20", amount: -120.0, merchant: "Mitre 10", description: "Hardware" }),
      sampleTransaction({ id: "t3", date: "2026-06-15", amount: -8.5, merchant: "Countdown", description: "Milk" }),
    ];
    const { connectionId, client } = await seedAccountAnd(ctx, txns);
    await syncTransactions(ctx, [{ connectionId, client }]);
    putSetting(ctx, SETTING_LAST_SYNC_AT, "2026-07-21T00:00:00.000Z");
    return ctx;
  }

  it("filters by Period", async () => {
    const ctx = await seeded();
    const out = invokeTool(ctx, listTransactionsTool, { period: "2026-07" });
    expect(out.count).toBe(2);
    expect(out.transactions.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    expect(out.data_as_of).toBe("2026-07-21T00:00:00.000Z");
  });

  it("filters by merchant substring and amount range", async () => {
    const ctx = await seeded();
    const byMerchant = invokeTool(ctx, listTransactionsTool, { merchant: "Countdown" });
    expect(byMerchant.transactions.map((t) => t.id).sort()).toEqual(["t1", "t3"]);

    // Signed amounts: -120.00 is the smallest (most negative).
    const bigSpend = invokeTool(ctx, listTransactionsTool, { max_amount_cents: -10000 });
    expect(bigSpend.transactions.map((t) => t.id)).toEqual(["t2"]);
  });

  it("search matches description or merchant", async () => {
    const ctx = await seeded();
    const out = invokeTool(ctx, searchTransactionsTool, { query: "milk" });
    expect(out.transactions.map((t) => t.id)).toEqual(["t3"]);
  });

  it("refresh delegates to the injected sync runner", async () => {
    const ctx = testContext();
    ctx.syncRunner = async () => ({
      accounts: { accountsUpserted: 1, snapshotsWritten: 1 },
      transactions: { inserted: 3, updated: 0, settled: 0, skipped: 0 },
      data_as_of: "2026-07-21T00:00:00.000Z",
    });
    const out = await invokeTool(ctx, refreshTool, {});
    expect(out).toMatchObject({
      data_as_of: "2026-07-21T00:00:00.000Z",
      transactions: { inserted: 3 },
    });
  });
});
