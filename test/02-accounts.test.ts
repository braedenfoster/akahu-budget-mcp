import { describe, expect, it } from "vitest";
import { accounts, balanceSnapshots } from "../src/db/schema.js";
import { syncAccounts } from "../src/sync/accounts.js";
import { listAccountsTool } from "../src/tools/accounts.js";
import { invokeTool } from "../src/tools/types.js";
import { putSetting, SETTING_LAST_SYNC_AT } from "../src/context.js";
import { FakeAkahuClient, sampleAccount } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";

describe("ticket 02 — account sync (Seam 2)", () => {
  it("lands accounts and a daily balance snapshot from a recorded response", async () => {
    const ctx = testContext("2026-07-15T09:00:00.000Z");
    const connectionId = seedConnection(ctx);
    const client = new FakeAkahuClient([sampleAccount()]);

    const result = await syncAccounts(ctx, [{ connectionId, client }]);
    expect(result).toEqual({ accountsUpserted: 1, snapshotsWritten: 1 });

    const acctRows = ctx.db.select().from(accounts).all();
    expect(acctRows).toHaveLength(1);
    // 1234.56 dollars -> integer cents.
    expect(acctRows[0]).toMatchObject({
      akahuId: "acc_everyday",
      connectionId,
      balanceCents: 123456,
      currency: "NZD",
    });

    const snaps = ctx.db.select().from(balanceSnapshots).all();
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({
      accountId: "acc_everyday",
      date: "2026-07-15",
      balanceCents: 123456,
    });
  });

  it("is idempotent: re-syncing updates in place, never duplicates", async () => {
    const ctx = testContext("2026-07-15T09:00:00.000Z");
    const connectionId = seedConnection(ctx);
    const client = new FakeAkahuClient([sampleAccount()]);

    await syncAccounts(ctx, [{ connectionId, client }]);
    // Balance changes; same account id and same day.
    client.setAccounts([
      sampleAccount({ balance: { currency: "NZD", current: 1000.0 } }),
    ]);
    await syncAccounts(ctx, [{ connectionId, client }]);

    expect(ctx.db.select().from(accounts).all()).toHaveLength(1);
    expect(ctx.db.select().from(accounts).get()?.balanceCents).toBe(100000);
    // Still one snapshot for the day — updated, not duplicated.
    const snaps = ctx.db.select().from(balanceSnapshots).all();
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.balanceCents).toBe(100000);
  });

  it("accrues a new snapshot per day", async () => {
    const day1 = testContext("2026-07-15T09:00:00.000Z");
    const connectionId = seedConnection(day1);
    const client = new FakeAkahuClient([sampleAccount()]);
    await syncAccounts(day1, [{ connectionId, client }]);

    // Same underlying db, advance the clock a day.
    const day2 = { ...day1, now: () => new Date("2026-07-16T09:00:00.000Z") };
    await syncAccounts(day2, [{ connectionId, client }]);

    const snaps = day1.db.select().from(balanceSnapshots).all();
    expect(snaps.map((s) => s.date).sort()).toEqual(["2026-07-15", "2026-07-16"]);
  });
});

describe("ticket 02 — list_accounts (Seam 1)", () => {
  it("returns accounts with member attribution and a data-as-of stamp", async () => {
    const ctx = testContext("2026-07-15T09:00:00.000Z");
    const connectionId = seedConnection(ctx, "Alex", 1);
    await syncAccounts(ctx, [
      { connectionId, client: new FakeAkahuClient([sampleAccount()]) },
    ]);
    putSetting(ctx, SETTING_LAST_SYNC_AT, "2026-07-15T09:00:00.000Z");

    const out = invokeTool(ctx, listAccountsTool, {});
    expect(out.data_as_of).toBe("2026-07-15T09:00:00.000Z");
    expect(out.total_balance_cents_by_currency).toEqual({ NZD: 123456 });
    expect(out.accounts).toHaveLength(1);
    expect(out.accounts[0]).toMatchObject({
      id: "acc_everyday",
      name: "Everyday",
      balance_cents: 123456,
      currency: "NZD",
      member: "Alex",
      balance_display: "NZD 1,234.56",
    });
  });

  it("never leaks credentials in its output", async () => {
    const ctx = testContext();
    const connectionId = seedConnection(ctx);
    await syncAccounts(ctx, [
      { connectionId, client: new FakeAkahuClient([sampleAccount()]) },
    ]);
    const out = invokeTool(ctx, listAccountsTool, {});
    const serialized = JSON.stringify(out);
    expect(serialized).not.toMatch(/token/i);
  });
});
