import { describe, expect, it } from "vitest";
import { runCategorization } from "../src/categorization/engine.js";
import { syncAccounts } from "../src/sync/accounts.js";
import { syncTransactions } from "../src/sync/transactions.js";
import { getBudgetTool } from "../src/tools/budget.js";
import { getPeriodSummaryTool } from "../src/tools/reports.js";
import {
  classifyIncomeTool,
  incomeCoverageTool,
  manageIncomeStreamsTool,
  setIncomeRuleTool,
} from "../src/tools/income.js";
import { invokeTool } from "../src/tools/types.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";
import type { AppContext } from "../src/context.js";

function createStream(ctx: AppContext, name: string): number {
  return (invokeTool(ctx, manageIncomeStreamsTool, { action: "create", name }) as { id: number })
    .id;
}

/**
 * Two Members / two Accounts, Salary + PPL streams, where PPL is present in
 * July but zero in August (the December-cliff scenario writ small), and a
 * second Account that never receives Income.
 */
async function seededStreams(): Promise<AppContext> {
  const ctx = testContext("2026-08-20T09:00:00.000Z");
  const c1 = seedConnection(ctx, "Alex", 1);
  const c2 = seedConnection(ctx, "Sam", 2);
  const alexAcct = sampleAccount({ _id: "acc_alex", name: "Alex Everyday" });
  const samAcct = sampleAccount({ _id: "acc_sam", name: "Sam Everyday" });
  const txns = [
    // July: salary + PPL (PPL arrives as a TRANSFER, into Alex's account)
    sampleTransaction({ id: "j_sal", account: "acc_alex", date: "2026-07-01", amount: 5000.0, description: "ACME PAYROLL" }),
    sampleTransaction({ id: "j_ppl", account: "acc_alex", date: "2026-07-15", amount: 1293.0, type: "TRANSFER", description: "IRD PAID PARENTAL LEAVE" }),
    // August: salary only — PPL has fallen to zero
    sampleTransaction({ id: "a_sal", account: "acc_alex", date: "2026-08-01", amount: 5000.0, description: "ACME PAYROLL" }),
  ];
  const client1 = new FakeAkahuClient([alexAcct], txns);
  const client2 = new FakeAkahuClient([samAcct], []);
  await syncAccounts(ctx, [
    { connectionId: c1, client: client1 },
    { connectionId: c2, client: client2 },
  ]);
  await syncTransactions(ctx, [
    { connectionId: c1, client: client1 },
    { connectionId: c2, client: client2 },
  ]);
  runCategorization(ctx);

  const salary = createStream(ctx, "Salary");
  const ppl = createStream(ctx, "PPL");
  invokeTool(ctx, setIncomeRuleTool, {
    match_type: "description",
    match_value: "payroll",
    income_stream_id: salary,
  });
  invokeTool(ctx, setIncomeRuleTool, {
    match_type: "description",
    match_value: "paid parental leave",
    income_stream_id: ppl,
  });
  return ctx;
}

describe("ticket 03 — per-Stream reporting + coverage (Seam 1)", () => {
  it("get_budget.income.by_stream reports exact per-Stream figures", async () => {
    const ctx = await seededStreams();
    const budget = invokeTool(ctx, getBudgetTool, { period: "2026-07" });
    expect(budget.income.actual_cents).toBe(629300); // 500000 + 129300
    expect(budget.income.by_stream).toEqual([
      { stream: "PPL", actual_cents: 129300 },
      { stream: "Salary", actual_cents: 500000 },
    ]);
    // by_stream reconciles with the actual total.
    expect(budget.income.by_stream.reduce((s, b) => s + b.actual_cents, 0)).toBe(
      budget.income.actual_cents,
    );
  });

  it("a Stream that received Income before still shows, at zero, once it stops", async () => {
    const ctx = await seededStreams();
    const summary = invokeTool(ctx, getPeriodSummaryTool, { period: "2026-08" });
    // PPL is listed at zero for August (watch it fall to zero); Salary continues.
    expect(summary.income_vs_spend.by_stream).toEqual([
      { stream: "PPL", actual_cents: 0 },
      { stream: "Salary", actual_cents: 500000 },
    ]);
    expect(summary.income_vs_spend.income_cents).toBe(500000);
  });

  it("a Period with no Budget still reports Income by Stream", async () => {
    const ctx = await seededStreams();
    const budget = invokeTool(ctx, getBudgetTool, { period: "2026-07" });
    expect(budget.has_budget).toBe(false);
    expect(budget.income.by_stream.map((b) => b.stream)).toEqual(["PPL", "Salary"]);
  });

  it("income_coverage flags a connected Account with zero Income", async () => {
    const ctx = await seededStreams();
    const coverage = invokeTool(ctx, incomeCoverageTool, { period: "2026-07" });
    const alex = coverage.accounts.find((a) => a.account_id === "acc_alex")!;
    const sam = coverage.accounts.find((a) => a.account_id === "acc_sam")!;
    expect(alex).toMatchObject({ income_cents: 629300, flagged: false });
    expect(sam).toMatchObject({ income_cents: 0, flagged: true });
    expect(coverage.total_income_cents).toBe(629300);
  });

  it("income_coverage reflects a one-off classification (income now visible on an account)", async () => {
    const ctx = await seededStreams();
    // Sam receives a credit that no rule catches; classify it as Income.
    const client = new FakeAkahuClient(
      [sampleAccount({ _id: "acc_sam", name: "Sam Everyday" })],
      [sampleTransaction({ id: "sam_pay", account: "acc_sam", date: "2026-07-20", amount: 800.0, description: "Side gig" })],
    );
    // acc_sam belongs to connection 2.
    await syncTransactions(ctx, [{ connectionId: 2, client }]);
    runCategorization(ctx); // fallback -> Unclassified income
    const coverage = invokeTool(ctx, incomeCoverageTool, { period: "2026-07" });
    expect(coverage.accounts.find((a) => a.account_id === "acc_sam")).toMatchObject({
      income_cents: 80000,
      flagged: false,
    });
  });
});
