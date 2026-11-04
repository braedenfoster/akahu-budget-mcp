import { describe, expect, it } from "vitest";
import { runSync } from "../src/sync/index.js";
import { getBudgetTool } from "../src/tools/budget.js";
import { incomeCoverageTool, manageIncomeStreamsTool, setIncomeRuleTool } from "../src/tools/income.js";
import { invokeTool } from "../src/tools/types.js";
import type { AppContext } from "../src/context.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";

const MID_OCTOBER = "2026-10-15T08:00:00.000Z";

const BILLS = sampleAccount({ _id: "acc_bills", name: "BILLS", type: "CHECKING" });
const CARD = sampleAccount({ _id: "acc_card", name: "Zero Visa", type: "CREDITCARD" });
const SAVINGS = sampleAccount({ _id: "acc_savings", name: "SAVINGS", type: "SAVINGS" });

type Txn = ReturnType<typeof sampleTransaction>;

async function setup(txns: Txn[], accounts = [BILLS, CARD, SAVINGS]): Promise<AppContext> {
  const ctx = testContext(MID_OCTOBER);
  const connectionId = seedConnection(ctx);
  await runSync(ctx, [{ connectionId, client: new FakeAkahuClient(accounts, txns) }]);
  return ctx;
}

function budget(ctx: AppContext) {
  return invokeTool(ctx, getBudgetTool, { period: "2026-10" });
}

describe("Internal transfers are paired (Seam 1)", () => {
  it("a card repayment is neither Income nor spend", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "out", account: "acc_bills", date: "2026-10-05", amount: -500, type: "TRANSFER", description: "TRANSFER TO ZERO VISA" }),
      sampleTransaction({ id: "in", account: "acc_card", date: "2026-10-05", amount: 500, type: "CREDIT", description: "PAYMENT THANKYOU" }),
    ]);

    const out = budget(ctx);
    expect(out.income.actual_cents).toBe(0);
    expect(out.totals.spent_cents).toBe(0);
  });

  it("an automatic payment to savings is paired", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "ap", account: "acc_bills", date: "2026-10-16", amount: -1800, type: "STANDING ORDER", description: "AP#26957006 TO B L FOSTER" }),
      sampleTransaction({ id: "dep", account: "acc_savings", date: "2026-10-16", amount: 1800, type: "CREDIT", description: "Automatic Payment" }),
    ]);

    const out = budget(ctx);
    expect(out.income.actual_cents).toBe(0);
    expect(out.totals.spent_cents).toBe(0);
  });

  it("pairs each Transaction at most once", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "ap1", account: "acc_bills", date: "2026-10-16", amount: -100, type: "STANDING ORDER" }),
      sampleTransaction({ id: "ap2", account: "acc_bills", date: "2026-10-16", amount: -100, type: "STANDING ORDER" }),
      sampleTransaction({ id: "dep", account: "acc_savings", date: "2026-10-16", amount: 100, type: "CREDIT" }),
    ]);

    expect(budget(ctx).totals.spent_cents).toBe(10000);
  });

  it("pairs the closest date when two credits could match", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "out", account: "acc_bills", date: "2026-10-10", amount: -100, type: "TRANSFER" }),
      sampleTransaction({ id: "a_far", account: "acc_card", date: "2026-10-08", amount: 100, type: "CREDIT" }),
      sampleTransaction({ id: "b_near", account: "acc_savings", date: "2026-10-10", amount: 100, type: "CREDIT" }),
    ]);

    const coverage = invokeTool(ctx, incomeCoverageTool, { period: "2026-10" });
    expect(Object.fromEntries(coverage.accounts.map((a) => [a.account, a.income_cents]))).toMatchObject({
      "Zero Visa": 10000,
      SAVINGS: 0,
    });
  });

  it("does not pair a salary with an equal purchase when neither leg is a transfer", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "pay", account: "acc_bills", date: "2026-10-10", amount: 2000, type: "CREDIT", description: "ACME PAYROLL" }),
      sampleTransaction({ id: "tv", account: "acc_card", date: "2026-10-10", amount: -2000, type: "DEBIT", group: "Shopping" }),
    ]);

    const out = budget(ctx);
    expect(out.income.actual_cents).toBe(200000);
    expect(out.totals.spent_cents).toBe(200000);
  });

  it("does not pair legs more than 3 days apart", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "out", account: "acc_bills", date: "2026-10-01", amount: -500, type: "TRANSFER" }),
      sampleTransaction({ id: "in", account: "acc_card", date: "2026-10-05", amount: 500, type: "CREDIT" }),
    ]);

    expect(budget(ctx).income.actual_cents).toBe(50000);
  });

  it("does not pair legs on the same Account", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "out", account: "acc_card", date: "2026-10-05", amount: -500, type: "TRANSFER" }),
      sampleTransaction({ id: "in", account: "acc_card", date: "2026-10-05", amount: 500, type: "CREDIT" }),
    ]);

    expect(budget(ctx).income.actual_cents).toBe(50000);
  });

  it("keeps a paired credit out of Income even when an Income Rule matches it", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "out", account: "acc_bills", date: "2026-10-05", amount: -500, type: "TRANSFER" }),
      sampleTransaction({ id: "in", account: "acc_card", date: "2026-10-05", amount: 500, type: "CREDIT", description: "PAYMENT THANKYOU" }),
    ]);
    const stream = invokeTool(ctx, manageIncomeStreamsTool, { action: "create", name: "Salary" }) as { id: number };
    invokeTool(ctx, setIncomeRuleTool, { match_type: "description", match_value: "thankyou", income_stream_id: stream.id });

    expect(budget(ctx).income.actual_cents).toBe(0);
  });

  it("pairs an older credit once the other Account is connected", async () => {
    const ctx = testContext(MID_OCTOBER);
    const connectionId = seedConnection(ctx);
    const credit = sampleTransaction({ id: "in", account: "acc_card", date: "2026-10-05", amount: 500, type: "CREDIT" });
    const client = new FakeAkahuClient([CARD], [credit]);
    await runSync(ctx, [{ connectionId, client }]);
    expect(budget(ctx).income.actual_cents).toBe(50000);

    client.setAccounts([CARD, BILLS]);
    client.setTransactions([
      credit,
      sampleTransaction({ id: "out", account: "acc_bills", date: "2026-10-05", amount: -500, type: "TRANSFER" }),
    ]);
    await runSync(ctx, [{ connectionId, client }]);

    expect(budget(ctx).income.actual_cents).toBe(0);
  });

  it("pairs transfers between Accounts of different Members", async () => {
    const ctx = testContext(MID_OCTOBER);
    const mine = seedConnection(ctx, "Braeden", 1);
    const theirs = seedConnection(ctx, "Partner", 2);
    await runSync(ctx, [
      {
        connectionId: mine,
        client: new FakeAkahuClient([BILLS], [
          sampleTransaction({ id: "out", account: "acc_bills", date: "2026-10-05", amount: -300, type: "TRANSFER" }),
        ]),
      },
      {
        connectionId: theirs,
        client: new FakeAkahuClient([sampleAccount({ _id: "acc_partner", name: "Partner" })], [
          sampleTransaction({ id: "in", account: "acc_partner", date: "2026-10-05", amount: 300, type: "CREDIT" }),
        ]),
      },
    ]);

    expect(budget(ctx).income.actual_cents).toBe(0);
  });
});
