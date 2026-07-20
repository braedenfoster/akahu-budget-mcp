import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { incomeRules, incomeStreams, transactions } from "../src/db/schema.js";
import { runCategorization } from "../src/categorization/engine.js";
import {
  ensureIncomeStreamByName,
  reclassifyIncome,
  UNCLASSIFIED_INCOME_NAME,
} from "../src/income/engine.js";
import { syncAccounts } from "../src/sync/accounts.js";
import { syncTransactions } from "../src/sync/transactions.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";
import type { AppContext } from "../src/context.js";

/** Seed + sync + classify a set of Transactions, returning the context. */
async function setup(txns: ReturnType<typeof sampleTransaction>[]): Promise<AppContext> {
  const ctx = testContext();
  const connectionId = seedConnection(ctx);
  const client = new FakeAkahuClient([sampleAccount()], txns);
  await syncAccounts(ctx, [{ connectionId, client }]);
  await syncTransactions(ctx, [{ connectionId, client }]);
  runCategorization(ctx);
  return ctx;
}

/** The Income Stream name a Transaction is classified into (null = not Income). */
function streamNameOf(ctx: AppContext, txnId: string): string | null {
  const row = ctx.db
    .select({ name: incomeStreams.name })
    .from(transactions)
    .leftJoin(incomeStreams, eq(transactions.incomeStreamId, incomeStreams.id))
    .where(eq(transactions.akahuId, txnId))
    .get();
  return row?.name ?? null;
}

function isIncome(ctx: AppContext, txnId: string): boolean {
  return ctx.db
    .select({ isIncome: transactions.isIncome })
    .from(transactions)
    .where(eq(transactions.akahuId, txnId))
    .get()!.isIncome;
}

/** Insert an Income Rule row directly (ticket 02 wraps this in a tool). */
function addIncomeRule(
  ctx: AppContext,
  matchType: string,
  matchValue: string,
  streamId: number,
  priority = 0,
): void {
  ctx.db
    .insert(incomeRules)
    .values({ matchType, matchValue, incomeStreamId: streamId, priority, createdAt: "2026-07-01T00:00:00.000Z" })
    .run();
}

describe("ticket 01 — income classification (engine Seam)", () => {
  it("routes credits into named Streams by description and by txn_type", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "pay", amount: 4000, description: "ACME PAYROLL JULY" }),
      sampleTransaction({ id: "ir", amount: 250.55, type: "INTEREST", description: "Interest" }),
    ]);
    const salary = ensureIncomeStreamByName(ctx, "Salary");
    const interest = ensureIncomeStreamByName(ctx, "Interest");
    addIncomeRule(ctx, "description", "payroll", salary);
    addIncomeRule(ctx, "txn_type", "INTEREST", interest);
    reclassifyIncome(ctx);

    expect(streamNameOf(ctx, "pay")).toBe("Salary");
    expect(streamNameOf(ctx, "ir")).toBe("Interest");
    // Exact integer cents preserved through classification.
    expect(
      ctx.db.select().from(transactions).where(eq(transactions.akahuId, "ir")).get()!.amountCents,
    ).toBe(25055);
  });

  it("promotes a positive TRANSFER into a Stream via a rule (the missing-PPL case)", async () => {
    const ctx = await setup([
      sampleTransaction({
        id: "ppl",
        amount: 1293.0,
        type: "TRANSFER",
        description: "IRD PAID PARENTAL LEAVE",
      }),
    ]);
    // A positive transfer with no rule is NOT Income (the old heuristic missed it).
    expect(streamNameOf(ctx, "ppl")).toBe(null);
    expect(isIncome(ctx, "ppl")).toBe(false);

    const pplStream = ensureIncomeStreamByName(ctx, "PPL");
    addIncomeRule(ctx, "description", "paid parental leave", pplStream);
    reclassifyIncome(ctx);

    expect(streamNameOf(ctx, "ppl")).toBe("PPL");
    expect(isIncome(ctx, "ppl")).toBe(true);
  });

  it("Unclassified income fallback counts a positive non-transfer; excludes a transfer", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "misc", amount: 120.0, description: "Random deposit" }),
      sampleTransaction({ id: "xfer", amount: 500.0, type: "TRANSFER", description: "Own transfer" }),
      sampleTransaction({ id: "spend", amount: -80.0, description: "Groceries" }),
    ]);
    expect(streamNameOf(ctx, "misc")).toBe(UNCLASSIFIED_INCOME_NAME);
    expect(isIncome(ctx, "misc")).toBe(true);
    expect(streamNameOf(ctx, "xfer")).toBe(null);
    expect(isIncome(ctx, "xfer")).toBe(false);
    // A debit is never Income.
    expect(streamNameOf(ctx, "spend")).toBe(null);
    expect(isIncome(ctx, "spend")).toBe(false);
  });

  it("backfill reclassifies history when a rule is added later", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "pay", amount: 4000, description: "ACME PAYROLL" }),
    ]);
    // Starts in the Unclassified fallback.
    expect(streamNameOf(ctx, "pay")).toBe(UNCLASSIFIED_INCOME_NAME);

    const salary = ensureIncomeStreamByName(ctx, "Salary");
    addIncomeRule(ctx, "description", "payroll", salary);
    const changed = reclassifyIncome(ctx);
    expect(changed).toBe(1);
    expect(streamNameOf(ctx, "pay")).toBe("Salary");
  });

  it("a one-off override survives later re-derivation", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "pay", amount: 4000, description: "ACME PAYROLL" }),
    ]);
    const bonus = ensureIncomeStreamByName(ctx, "Bonus");
    // Simulate a protected one-off classification (ticket 02's classify_income).
    ctx.db
      .update(transactions)
      .set({ incomeStreamId: bonus, isIncome: true, incomeOverride: true })
      .where(eq(transactions.akahuId, "pay"))
      .run();

    // A description rule + backfill must NOT clobber the manual override.
    const salary = ensureIncomeStreamByName(ctx, "Salary");
    addIncomeRule(ctx, "description", "payroll", salary);
    reclassifyIncome(ctx);
    expect(streamNameOf(ctx, "pay")).toBe("Bonus");
  });
});
