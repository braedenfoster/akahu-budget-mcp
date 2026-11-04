import { describe, expect, it } from "vitest";
import { runSync } from "../src/sync/index.js";
import { getBudgetTool, setAllocationTool } from "../src/tools/budget.js";
import { categorizeTransactionTool, listCategoriesTool, manageCategoriesTool } from "../src/tools/categories.js";
import { listAccountsTool, setSavingsAccountTool } from "../src/tools/accounts.js";
import { listBillCandidatesTool } from "../src/tools/bills.js";
import { runCategorization } from "../src/categorization/engine.js";
import { auditLog } from "../src/db/schema.js";
import { ReadOnlyError } from "../src/write.js";
import { incomeCoverageTool, manageIncomeStreamsTool, setIncomeRuleTool } from "../src/tools/income.js";
import { invokeTool } from "../src/tools/types.js";
import { putSetting, SETTING_BUDGET_MONTH_START_DAY, type AppContext } from "../src/context.js";
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

function categoryId(ctx: AppContext, name: string): number {
  return invokeTool(ctx, listCategoriesTool, {}).categories.find((c) => c.name === name)!.id;
}

/** BILLS, card and SAVINGS, with SAVINGS linked to a Committed Savings Envelope; Periods run 15th to 14th. */
async function savingsSetup(txns: Txn[], allocatedCents: number | null = 100000): Promise<AppContext> {
  const ctx = await setup(txns);
  putSetting(ctx, SETTING_BUDGET_MONTH_START_DAY, "15");
  invokeTool(ctx, manageCategoriesTool, { action: "create", name: "Savings", kind: "committed" });
  invokeTool(ctx, setSavingsAccountTool, { account_id: "acc_savings", budget_category_id: categoryId(ctx, "Savings") });
  if (allocatedCents !== null)
    invokeTool(ctx, setAllocationTool, { period: "2026-10", category_id: categoryId(ctx, "Savings"), amount_cents: allocatedCents });
  return ctx;
}

function savingsEnvelope(ctx: AppContext) {
  return budget(ctx).envelopes.find((e) => e.category === "Savings")!;
}

const DEPOSIT = [
  sampleTransaction({ id: "ap", account: "acc_bills", date: "2026-10-16", amount: -1800, type: "STANDING ORDER", description: "AP#26957006 TO B L FOSTER" }),
  sampleTransaction({ id: "dep", account: "acc_savings", date: "2026-10-16", amount: 1800, type: "CREDIT", description: "Automatic Payment" }),
];

function withdrawal(id: string, date: string, dollars: number): Txn[] {
  return [
    sampleTransaction({ id: `${id}_out`, account: "acc_savings", date, amount: -dollars, type: "TRANSFER", description: "TRANSFER TO BILLS" }),
    sampleTransaction({ id: `${id}_in`, account: "acc_bills", date, amount: dollars, type: "TRANSFER", description: "TRANSFER FROM SAVINGS" }),
  ];
}

describe("A Savings Account counts net transfers toward its Envelope (Seam 1)", () => {
  it("nets the October deposit and withdrawals: $1,800 in, $1,040 out", async () => {
    const ctx = await savingsSetup([
      ...DEPOSIT,
      ...withdrawal("w1", "2026-10-29", 400),
      ...withdrawal("w2", "2026-10-30", 400),
      ...withdrawal("w3", "2026-11-03", 240),
    ]);

    expect(savingsEnvelope(ctx)).toMatchObject({ allocated_cents: 100000, spent_cents: 76000, remaining_cents: 24000 });
    expect(budget(ctx).spending_allowance.committed_overspend_cents).toBe(0);
    expect(budget(ctx).income.actual_cents).toBe(0);
  });

  it("counts a deposit above the allocation as Committed overspend", async () => {
    const ctx = await savingsSetup(DEPOSIT);

    expect(savingsEnvelope(ctx)).toMatchObject({ spent_cents: 180000, remaining_cents: -80000 });
    expect(budget(ctx).spending_allowance).toMatchObject({ committed_overspend_cents: 80000, amount_cents: -80000 });
  });

  it("gives negative spend when withdrawals exceed deposits, without raising the allowance", async () => {
    const ctx = await savingsSetup([...withdrawal("w1", "2026-10-20", 500)]);

    expect(savingsEnvelope(ctx)).toMatchObject({ spent_cents: -50000, remaining_cents: 150000 });
    expect(budget(ctx).spending_allowance).toMatchObject({ committed_overspend_cents: 0, amount_cents: 0 });
  });

  it("counts a purchase funded from savings once, in its own Budget Category", async () => {
    const ctx = await savingsSetup([
      ...DEPOSIT,
      ...withdrawal("w1", "2026-10-29", 400),
      sampleTransaction({ id: "fix", account: "acc_card", date: "2026-10-29", amount: -400, group: "Transport" }),
    ]);

    const spent = Object.fromEntries(budget(ctx).envelopes.map((e) => [e.category, e.spent_cents]));
    expect(spent).toMatchObject({ Savings: 140000, Transport: 40000 });
    expect(budget(ctx).totals.spent_cents).toBe(180000);
  });

  it("keeps interest on a Savings Account as Income", async () => {
    const ctx = await savingsSetup([
      sampleTransaction({ id: "int", account: "acc_savings", date: "2026-10-31", amount: 15.43, type: "INTEREST" }),
    ]);

    expect(budget(ctx).income.actual_cents).toBe(1543);
    expect(budget(ctx).envelopes.find((e) => e.category === "Savings")!.spent_cents).toBe(0);
  });

  it("counts a savings leg in the linked category even when a Member moved it elsewhere", async () => {
    const ctx = await savingsSetup(DEPOSIT);
    invokeTool(ctx, manageCategoriesTool, { action: "create", name: "Transfers", kind: "committed" });
    invokeTool(ctx, categorizeTransactionTool, { transaction_id: "dep", category_id: categoryId(ctx, "Transfers") });
    runCategorization(ctx);

    expect(savingsEnvelope(ctx).spent_cents).toBe(180000);
  });

  it("excludes both legs again once the Account is unlinked", async () => {
    const ctx = await savingsSetup(DEPOSIT);
    invokeTool(ctx, setSavingsAccountTool, { account_id: "acc_savings", budget_category_id: null });

    expect(budget(ctx).totals.spent_cents).toBe(0);
  });

  it("does not propose a regular savings withdrawal as a Bill candidate", async () => {
    const months = ["2026-05-16", "2026-06-16", "2026-07-16", "2026-08-16", "2026-09-16", "2026-10-16"];
    const ctx = await savingsSetup(months.flatMap((date, i) => withdrawal(`w${i}`, date, 500)));

    expect(invokeTool(ctx, listBillCandidatesTool, {}).candidates).toEqual([]);
  });
});

describe("set_savings_account (Seam 1)", () => {
  it("shows the link on list_accounts", async () => {
    const ctx = await savingsSetup([]);

    const savings = invokeTool(ctx, listAccountsTool, {}).accounts.find((a) => a.id === "acc_savings")!;
    expect(savings.savings_category).toEqual({ id: categoryId(ctx, "Savings"), name: "Savings" });
  });

  it("refuses Uncategorized and unknown ids", async () => {
    const ctx = await savingsSetup([]);

    expect(() =>
      invokeTool(ctx, setSavingsAccountTool, { account_id: "acc_savings", budget_category_id: categoryId(ctx, "Uncategorized") }),
    ).toThrow(/Uncategorized/);
    expect(() => invokeTool(ctx, setSavingsAccountTool, { account_id: "acc_nope", budget_category_id: null })).toThrow(/acc_nope/);
    expect(() => invokeTool(ctx, setSavingsAccountTool, { account_id: "acc_savings", budget_category_id: 9999 })).toThrow(/9999/);
  });

  it("appends one audit row per link and is refused in read-only mode", async () => {
    const ctx = await savingsSetup([]);
    const before = ctx.db.select().from(auditLog).all().length;
    putSetting(ctx, "read_only", "true");

    expect(() => invokeTool(ctx, setSavingsAccountTool, { account_id: "acc_savings", budget_category_id: null })).toThrow(ReadOnlyError);
    expect(ctx.db.select().from(auditLog).all()).toHaveLength(before);
    const rows = ctx.db.select().from(auditLog).all().filter((r) => r.tool === "set_savings_account");
    expect(rows.map((r) => JSON.parse(r.payload!))).toEqual([
      { account_id: "acc_savings", budget_category_id: categoryId(ctx, "Savings") },
    ]);
  });

  it("moves the link when its category is merged", async () => {
    const ctx = await savingsSetup(DEPOSIT, null);
    invokeTool(ctx, manageCategoriesTool, { action: "create", name: "Rainy day", kind: "committed" });
    invokeTool(ctx, manageCategoriesTool, { action: "merge", source_id: categoryId(ctx, "Savings"), target_id: categoryId(ctx, "Rainy day") });

    const savings = invokeTool(ctx, listAccountsTool, {}).accounts.find((a) => a.id === "acc_savings")!;
    expect(savings.savings_category?.name).toBe("Rainy day");
  });
});
