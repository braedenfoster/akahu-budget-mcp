import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, incomeStreams, transactions } from "../src/db/schema.js";
import { runCategorization } from "../src/categorization/engine.js";
import { syncAccounts } from "../src/sync/accounts.js";
import { syncTransactions } from "../src/sync/transactions.js";
import {
  classifyIncomeTool,
  listIncomeStreamsTool,
  listUnclassifiedIncomeTool,
  manageIncomeStreamsTool,
  setIncomeRuleTool,
} from "../src/tools/income.js";
import { invokeTool } from "../src/tools/types.js";
import { putSetting } from "../src/context.js";
import { ReadOnlyError } from "../src/write.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";
import type { AppContext } from "../src/context.js";

async function setup(txns: ReturnType<typeof sampleTransaction>[]): Promise<AppContext> {
  const ctx = testContext();
  const connectionId = seedConnection(ctx);
  const client = new FakeAkahuClient([sampleAccount()], txns);
  await syncAccounts(ctx, [{ connectionId, client }]);
  await syncTransactions(ctx, [{ connectionId, client }]);
  runCategorization(ctx);
  return ctx;
}

function createStream(ctx: AppContext, name: string): number {
  return (invokeTool(ctx, manageIncomeStreamsTool, { action: "create", name }) as { id: number })
    .id;
}

function streamNameOf(ctx: AppContext, txnId: string): string | null {
  const row = ctx.db
    .select({ name: incomeStreams.name })
    .from(transactions)
    .leftJoin(incomeStreams, eq(transactions.incomeStreamId, incomeStreams.id))
    .where(eq(transactions.akahuId, txnId))
    .get();
  return row?.name ?? null;
}

describe("ticket 02 — income tools (Seam 1)", () => {
  it("creates, renames, and merges Income Streams", async () => {
    const ctx = await setup([]);
    const salary = createStream(ctx, "Salary");
    const wages = createStream(ctx, "Wages");

    invokeTool(ctx, manageIncomeStreamsTool, {
      action: "rename",
      id: wages,
      new_name: "Weekly wages",
    });
    invokeTool(ctx, manageIncomeStreamsTool, {
      action: "merge",
      source_id: wages,
      target_id: salary,
    });

    const list = invokeTool(ctx, listIncomeStreamsTool, {});
    const names = list.streams.map((s) => s.name);
    expect(names).toContain("Salary");
    expect(names).not.toContain("Weekly wages");
    expect(names).toContain("Unclassified income");
  });

  it("refuses to merge away the system Unclassified income Stream", async () => {
    const ctx = await setup([]);
    const salary = createStream(ctx, "Salary");
    const unclassified = ctx.db
      .select({ id: incomeStreams.id })
      .from(incomeStreams)
      .where(eq(incomeStreams.name, "Unclassified income"))
      .get()!.id;
    expect(() =>
      invokeTool(ctx, manageIncomeStreamsTool, {
        action: "merge",
        source_id: unclassified,
        target_id: salary,
      }),
    ).toThrow(/cannot be merged away/i);
  });

  it("set_income_rule promotes a positive TRANSFER and backfills history", async () => {
    const ctx = await setup([
      sampleTransaction({
        id: "ppl",
        amount: 1293.0,
        type: "TRANSFER",
        description: "IRD PAID PARENTAL LEAVE",
      }),
    ]);
    // Not Income until a rule promotes it.
    expect(streamNameOf(ctx, "ppl")).toBe(null);

    const ppl = createStream(ctx, "PPL");
    const result = invokeTool(ctx, setIncomeRuleTool, {
      match_type: "description",
      match_value: "paid parental leave",
      income_stream_id: ppl,
      backfill: true,
    });
    expect(result.reclassified).toBe(1);
    expect(streamNameOf(ctx, "ppl")).toBe("PPL");

    // The Stream's actual for the Period reflects the exact integer cents.
    const list = invokeTool(ctx, listIncomeStreamsTool, { period: "2026-07" });
    expect(list.streams.find((s) => s.name === "PPL")!.actual_cents).toBe(129300);
  });

  it("classify_income overrides a one-off and can clear it to not-Income", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "refund", amount: 60.0, description: "Store refund" }),
    ]);
    // The fallback counts it as Unclassified income.
    expect(streamNameOf(ctx, "refund")).toBe("Unclassified income");

    // Mark it explicitly NOT Income (a refund, not earnings).
    invokeTool(ctx, classifyIncomeTool, { transaction_id: "refund", income_stream_id: null });
    expect(streamNameOf(ctx, "refund")).toBe(null);
    expect(
      ctx.db.select().from(transactions).where(eq(transactions.akahuId, "refund")).get()!.isIncome,
    ).toBe(false);

    // Re-classify into a named Stream as a one-off.
    const salary = createStream(ctx, "Salary");
    invokeTool(ctx, classifyIncomeTool, { transaction_id: "refund", income_stream_id: salary });
    expect(streamNameOf(ctx, "refund")).toBe("Salary");
  });

  it("list_unclassified_income surfaces a missing credit, largest first, transfers flagged", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "small", amount: 60.0, description: "Random deposit" }),
      sampleTransaction({
        id: "big_xfer",
        amount: 1293.0,
        type: "TRANSFER",
        description: "IRD PAID PARENTAL LEAVE",
      }),
      sampleTransaction({ id: "spend", amount: -80.0, description: "Groceries" }),
    ]);

    const out = invokeTool(ctx, listUnclassifiedIncomeTool, {});
    // Largest first; the debit is excluded.
    expect(out.transactions.map((t) => t.id)).toEqual(["big_xfer", "small"]);
    expect(out.transactions[0]).toMatchObject({ amount_cents: 129300, is_transfer: true });
    expect(out.transactions[1]).toMatchObject({ amount_cents: 6000, is_transfer: false });
  });

  it("a one-off classify_income survives Income Rule re-derivation (tool seam)", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "pay", amount: 4000, description: "ACME PAYROLL" }),
    ]);
    const bonus = createStream(ctx, "Bonus");
    invokeTool(ctx, classifyIncomeTool, { transaction_id: "pay", income_stream_id: bonus });
    expect(streamNameOf(ctx, "pay")).toBe("Bonus");

    // A description rule + backfill must NOT clobber the manual override.
    const salary = createStream(ctx, "Salary");
    invokeTool(ctx, setIncomeRuleTool, {
      match_type: "description",
      match_value: "payroll",
      income_stream_id: salary,
      backfill: true,
    });
    expect(streamNameOf(ctx, "pay")).toBe("Bonus");
  });

  it("a dismissed credit (classify_income null) does not resurface in the review list", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "refund", amount: 60.0, description: "Store refund" }),
    ]);
    expect(invokeTool(ctx, listUnclassifiedIncomeTool, {}).transactions.map((t) => t.id)).toEqual([
      "refund",
    ]);
    invokeTool(ctx, classifyIncomeTool, { transaction_id: "refund", income_stream_id: null });
    expect(invokeTool(ctx, listUnclassifiedIncomeTool, {}).transactions).toHaveLength(0);
  });

  it("every income write is refused in read-only mode and logs nothing", async () => {
    const ctx = await setup([
      sampleTransaction({ id: "t1", amount: 100.0, description: "Deposit" }),
    ]);
    // Set up a valid Stream while still writable, so the read-only path (not a
    // validation error) is what each write hits.
    const salary = createStream(ctx, "Salary");
    putSetting(ctx, "read_only", "true");
    const auditRowsBefore = ctx.db.select().from(auditLog).all().length;

    expect(() =>
      invokeTool(ctx, manageIncomeStreamsTool, { action: "create", name: "Nope" }),
    ).toThrow(ReadOnlyError);
    expect(() =>
      invokeTool(ctx, setIncomeRuleTool, {
        match_type: "description",
        match_value: "deposit",
        income_stream_id: salary,
      }),
    ).toThrow(ReadOnlyError);
    expect(() =>
      invokeTool(ctx, classifyIncomeTool, { transaction_id: "t1", income_stream_id: salary }),
    ).toThrow(ReadOnlyError);

    // The refused writes appended no audit rows.
    expect(ctx.db.select().from(auditLog).all()).toHaveLength(auditRowsBefore);
  });
});
