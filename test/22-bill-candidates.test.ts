import { describe, expect, it } from "vitest";
import { listBillCandidatesTool, listBillsTool, manageBillsTool, type ShapedBill } from "../src/tools/bills.js";
import { auditLog } from "../src/db/schema.js";
import { ReadOnlyError } from "../src/write.js";
import { invokeTool } from "../src/tools/types.js";
import { makeContext, putSetting, type AppContext } from "../src/context.js";
import { openAndMigrate } from "../src/db/index.js";
import { runSync } from "../src/sync/index.js";
import { FakeAkahuClient, sampleAccount, sampleTransaction } from "./fixtures/akahu.js";
import { seedConnection, testContext } from "./helpers.js";

// 09:00 on Tue 20 Oct 2026 in Auckland (NZDT, UTC+13).
const TUE_20_OCT = "2026-10-19T20:00:00.000Z";

type Txn = ReturnType<typeof sampleTransaction>;

async function synced(txns: Txn[], now = TUE_20_OCT): Promise<AppContext> {
  const ctx = testContext(now);
  const connectionId = seedConnection(ctx);
  await runSync(ctx, [{ connectionId, client: new FakeAkahuClient([sampleAccount()], txns) }]);
  return ctx;
}

/** Ids are `${prefix}${index}`, so a test can name a debit, such as candidate_id "n5". */
function debits(prefix: string, dates: string[], fields: { amount: number; merchant?: string; description?: string; type?: string }) {
  return dates.map((date, i) => sampleTransaction({ id: `${prefix}${i}`, date, ...fields }));
}

function candidates(ctx: AppContext) {
  return invokeTool(ctx, listBillCandidatesTool, {}).candidates;
}

const EDUCATION_AP = { amount: -154, description: "AP#26066736 TO EDUCATIONAL HOLDINGS LTD", type: "STANDING ORDER" };
const MORTGAGE_AP = { amount: -2350.8, description: "AP#25174032 TO KIWIBANK HOME LOAN", type: "LOAN" };

const NETFLIX_DATES = ["2026-05-10", "2026-06-10", "2026-07-10", "2026-08-10", "2026-09-10", "2026-10-10"];

describe("Bill candidates (Seam 1)", () => {
  it("proposes a monthly Bill candidate with its supporting debits", async () => {
    const ctx = await synced(debits("n", NETFLIX_DATES, { amount: -25.99, merchant: "Netflix" }));

    expect(candidates(ctx)).toEqual([
      {
        candidate_id: "n5",
        name: "Netflix",
        cadence: "monthly",
        weekday: null,
        day_of_month: 10,
        anchor_date: null,
        amount_mode: "fixed",
        expected_amount_cents: 2599,
        expected_amount_display: "$25.99",
        match_type: "merchant",
        match_value: "Netflix",
        debits: [5, 4, 3, 2, 1, 0].map((i) => ({
          id: `n${i}`,
          date: NETFLIX_DATES[i],
          amount_cents: 2599,
          amount_display: "$25.99",
          description: "Purchase",
        })),
      },
    ]);
  });

  it("proposes a weekly AP# standing order by description, from its latest steady run", async () => {
    const schoolHolidays = debits("old", ["2026-08-02", "2026-08-09"], EDUCATION_AP);
    const term = debits("e", ["2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18"], EDUCATION_AP);
    const ctx = await synced([...schoolHolidays, ...term]);

    const [education] = candidates(ctx);

    expect(education).toMatchObject({
      candidate_id: "e6",
      name: "AP#26066736 TO EDUCATIONAL HOLDINGS LTD",
      cadence: "weekly",
      weekday: "sunday",
      day_of_month: null,
      anchor_date: null,
      amount_mode: "fixed",
      expected_amount_cents: 15400,
      match_type: "description",
      match_value: "AP#26066736 TO EDUCATIONAL HOLDINGS LTD",
    });
    expect(education!.debits.map((d) => d.id)).toEqual(["e6", "e5", "e4", "e3", "e2", "e1", "e0"]);
  });

  it("proposes a monthly AP# LOAN payment, and the day most of its debits land on", async () => {
    // 26 Apr 2026 was a Sunday, so that debit landed on Monday the 27th.
    const ctx = await synced(
      debits("m", ["2026-04-27", "2026-05-26", "2026-06-26", "2026-07-26", "2026-08-26", "2026-09-26"], MORTGAGE_AP),
    );

    expect(candidates(ctx)).toMatchObject([
      {
        name: "AP#25174032 TO KIWIBANK HOME LOAN",
        cadence: "monthly",
        day_of_month: 26,
        amount_mode: "fixed",
        expected_amount_cents: 235080,
        match_type: "description",
      },
    ]);
  });

  it("proposes a fortnightly candidate in estimated mode when the amounts vary", async () => {
    const ctx = await synced([
      sampleTransaction({ id: "k0", date: "2026-09-03", amount: -120, merchant: "Kindy" }),
      sampleTransaction({ id: "k1", date: "2026-09-17", amount: -131.5, merchant: "Kindy" }),
      sampleTransaction({ id: "k2", date: "2026-10-01", amount: -118, merchant: "Kindy" }),
      sampleTransaction({ id: "k3", date: "2026-10-15", amount: -125.2, merchant: "Kindy" }),
    ]);

    expect(candidates(ctx)).toMatchObject([
      {
        name: "Kindy",
        cadence: "fortnightly",
        weekday: null,
        day_of_month: null,
        anchor_date: "2026-10-15",
        amount_mode: "estimated",
        expected_amount_cents: 12520,
        expected_amount_display: "$125.20",
      },
    ]);
  });

  it("splits one merchant's debits into a Bill candidate per amount cluster", async () => {
    const dates = ["2026-07-26", "2026-08-26", "2026-09-26"];
    const ctx = await synced([
      ...debits("life", dates, { amount: -225.12, merchant: "AIA New Zealand" }),
      ...debits("health", dates, { amount: -307.06, merchant: "AIA New Zealand" }),
    ]);

    expect(candidates(ctx).map((c) => [c.name, c.expected_amount_cents, c.debits.length])).toEqual([
      ["AIA New Zealand", 22512, 3],
      ["AIA New Zealand", 30706, 3],
    ]);
  });

  it("keeps a price rise in one amount cluster", async () => {
    const ctx = await synced([
      ...debits("old", ["2026-06-18", "2026-07-18"], { amount: -16.99, merchant: "Disney" }),
      ...debits("new", ["2026-08-18", "2026-09-18", "2026-10-18"], { amount: -18.99, merchant: "Disney" }),
    ]);

    expect(candidates(ctx)).toMatchObject([
      { name: "Disney", amount_mode: "estimated", expected_amount_cents: 1899, debits: { length: 5 } },
    ]);
  });

  it("counts debits on one date once for the interval", async () => {
    const dates = ["2026-07-29", "2026-08-28", "2026-09-28"];
    const ctx = await synced([
      ...debits("a", dates, { amount: -11.5, merchant: "AIA GoCardless" }),
      ...debits("b", dates, { amount: -11.5, merchant: "AIA GoCardless" }),
    ]);

    expect(candidates(ctx)).toMatchObject([{ name: "AIA GoCardless", cadence: "monthly", day_of_month: 28, debits: { length: 6 } }]);
  });

  it("keeps proposing two equal debits on each date until two Bills cover them", async () => {
    const dates = ["2026-07-29", "2026-08-28", "2026-09-28"];
    const ctx = await synced([
      ...debits("a", dates, { amount: -11.5, merchant: "AIA GoCardless" }),
      ...debits("b", dates, { amount: -11.5, merchant: "AIA GoCardless" }),
    ]);

    invokeTool(ctx, manageBillsTool, { action: "confirm", candidate_id: candidates(ctx)[0]!.candidate_id, name: "AIA cover 1" });
    const [second] = candidates(ctx);
    invokeTool(ctx, manageBillsTool, { action: "confirm", candidate_id: second!.candidate_id, name: "AIA cover 2" });

    expect(second).toMatchObject({ name: "AIA GoCardless", debits: { length: 6 } });
    expect(candidates(ctx)).toEqual([]);
    expect(bills(ctx).map((b) => b.name)).toEqual(["AIA cover 1", "AIA cover 2"]);
  });

  it("does not propose a pattern that drifts away from its proposed due dates", async () => {
    const everyFourWeeks = ["2026-06-01", "2026-06-29", "2026-07-27", "2026-08-24", "2026-09-21", "2026-10-19"];
    const ctx = await synced(debits("o", everyFourWeeks, { amount: -63.5, merchant: "Ozone Coffee" }));

    expect(candidates(ctx)).toEqual([]);
  });

  it("leaves out an old debit that missed the proposed due date", async () => {
    const ctx = await synced(
      debits("g", ["2026-05-06", "2026-06-10", "2026-07-10", "2026-08-10", "2026-09-10", "2026-10-10"], { amount: -16.99, merchant: "Google" }),
    );

    expect(candidates(ctx)).toMatchObject([{ name: "Google", day_of_month: 10, debits: { length: 5 } }]);
  });

  it("does not propose a one-off, a pattern under 3 debits or an irregular one", async () => {
    const ctx = await synced([
      sampleTransaction({ id: "r1", date: "2026-09-20", amount: -1277.23, merchant: "Auckland Council" }),
      ...debits("p", ["2026-09-20", "2026-10-20"], { amount: -40, merchant: "Mighty Mobile" }),
      ...debits("i", ["2026-08-01", "2026-08-19", "2026-09-30", "2026-10-02"], { amount: -84.84, merchant: "2degrees" }),
    ]);

    expect(candidates(ctx)).toEqual([]);
  });

  it("does not propose Internal transfers, credits or pending debits", async () => {
    const ctx = await synced([
      ...debits("t", NETFLIX_DATES, { amount: -500, description: "To savings", type: "TRANSFER" }),
      ...debits("c", NETFLIX_DATES, { amount: 25.99, merchant: "Netflix" }),
      ...["2026-10-06", "2026-10-13", "2026-10-20"].map((date, i) =>
        sampleTransaction({ id: `pending${i}`, date, amount: -9, merchant: "Coffee", pending: true }),
      ),
    ]);

    expect(candidates(ctx)).toEqual([]);
  });

  it("does not propose a pattern whose debits stopped", async () => {
    const gym = debits("g", ["2026-05-27", "2026-06-27", "2026-07-27", "2026-08-27"], { amount: -86.45, merchant: "Anytime Fitness" });
    const stillMonthly = await synced(gym, "2026-10-10T20:00:00.000Z");
    const stopped = await synced(gym, "2026-10-11T20:00:00.000Z");

    expect(candidates(stillMonthly).map((c) => c.name)).toEqual(["Anytime Fitness"]);
    expect(candidates(stopped)).toEqual([]);
  });

  it("reads only the last 6 months of debits", async () => {
    const ctx = await synced(debits("n", ["2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"], { amount: -25.99, merchant: "Netflix" }));

    expect(candidates(ctx)[0]!.debits.map((d) => d.date)).toEqual([
      "2026-10-01",
      "2026-09-01",
      "2026-08-01",
      "2026-07-01",
      "2026-06-01",
      "2026-05-01",
    ]);
  });
});

const AIA_DATES = ["2026-07-26", "2026-08-26", "2026-09-26"];
const AIA_PAIR = [
  ...debits("life", AIA_DATES, { amount: -225.12, merchant: "AIA New Zealand" }),
  ...debits("health", AIA_DATES, { amount: -307.06, merchant: "AIA New Zealand" }),
];

function bills(ctx: AppContext) {
  return invokeTool(ctx, listBillsTool, {}).bills;
}

describe("Confirming and declining Bill candidates (Seam 1)", () => {
  it("confirms a candidate as a Bill, which is then not proposed again", async () => {
    const ctx = await synced(debits("n", NETFLIX_DATES, { amount: -25.99, merchant: "Netflix" }));

    const bill = invokeTool(ctx, manageBillsTool, { action: "confirm", candidate_id: "n5" });

    expect(bill).toMatchObject({
      name: "Netflix",
      cadence: "monthly",
      day_of_month: 10,
      amount_mode: "fixed",
      expected_amount_cents: 2599,
      match_type: "merchant",
      match_value: "Netflix",
      status: "active",
    });
    expect(bills(ctx)).toEqual([{ ...bill, missed_due_dates: [] }]);
    expect(candidates(ctx)).toEqual([]);
  });

  it("confirms a candidate with changes to the name, cadence, anchor and amount", async () => {
    const ctx = await synced(debits("e", ["2026-10-04", "2026-10-11", "2026-10-18"], EDUCATION_AP));

    const renamed = invokeTool(ctx, manageBillsTool, {
      action: "confirm",
      candidate_id: "e2",
      name: "Education",
      expected_amount_cents: 16000,
      amount_mode: "estimated",
    });
    const fortnightly = await synced(debits("e", ["2026-10-04", "2026-10-11", "2026-10-18"], EDUCATION_AP));
    const moved = invokeTool(fortnightly, manageBillsTool, {
      action: "confirm",
      candidate_id: "e2",
      cadence: "fortnightly",
      anchor_date: "2026-10-18",
    });

    expect(renamed).toMatchObject({
      name: "Education",
      cadence: "weekly",
      weekday: "sunday",
      amount_mode: "estimated",
      expected_amount_cents: 16000,
      match_type: "description",
      match_value: "AP#26066736 TO EDUCATIONAL HOLDINGS LTD",
    });
    expect(moved).toMatchObject({ cadence: "fortnightly", weekday: null, anchor_date: "2026-10-18" });
  });

  it("refuses a confirm that changes the cadence without the anchor it takes", async () => {
    const ctx = await synced(debits("n", NETFLIX_DATES, { amount: -25.99, merchant: "Netflix" }));

    expect(() => invokeTool(ctx, manageBillsTool, { action: "confirm", candidate_id: "n5", cadence: "weekly" })).toThrow(
      "weekly Bills need `weekday`.",
    );
  });

  it("refuses an unknown candidate id", async () => {
    const ctx = await synced([]);

    expect(() => invokeTool(ctx, manageBillsTool, { action: "confirm", candidate_id: "gone" })).toThrow(
      /No Bill candidate with id gone/,
    );
    expect(() => invokeTool(ctx, manageBillsTool, { action: "decline" })).toThrow("decline requires `candidate_id`.");
  });

  it("does not propose a declined candidate again, even after its next debit", async () => {
    const ctx = testContext(TUE_20_OCT);
    const connectionId = seedConnection(ctx);
    const client = new FakeAkahuClient([sampleAccount()], debits("n", NETFLIX_DATES.slice(0, 5), { amount: -25.99, merchant: "Netflix" }));
    await runSync(ctx, [{ connectionId, client }]);

    invokeTool(ctx, manageBillsTool, { action: "decline", candidate_id: "n4" });
    client.setTransactions(debits("n", NETFLIX_DATES, { amount: -25.99, merchant: "Netflix" }));
    await runSync(ctx, [{ connectionId, client }]);

    expect(candidates(ctx)).toEqual([]);
    expect(bills(ctx)).toEqual([]);
  });

  it("still proposes the other amount cluster after a decline", async () => {
    const ctx = await synced(AIA_PAIR);
    const [life] = candidates(ctx);

    invokeTool(ctx, manageBillsTool, { action: "decline", candidate_id: life!.candidate_id });

    expect(candidates(ctx).map((c) => c.expected_amount_cents)).toEqual([30706]);
  });

  it("does not propose a pattern an active Bill covers, but proposes the other amount cluster", async () => {
    const ctx = await synced(AIA_PAIR);

    invokeTool(ctx, manageBillsTool, {
      action: "create",
      name: "AIA life",
      cadence: "monthly",
      day_of_month: 26,
      expected_amount_cents: 22500,
      match_type: "merchant",
      match_value: "AIA New Zealand",
    });

    expect(candidates(ctx).map((c) => c.expected_amount_cents)).toEqual([30706]);
  });

  it("proposes a pattern again after its Bill ends", async () => {
    const ctx = await synced(debits("n", NETFLIX_DATES, { amount: -25.99, merchant: "Netflix" }));
    const bill = invokeTool(ctx, manageBillsTool, { action: "confirm", candidate_id: "n5" }) as ShapedBill;

    invokeTool(ctx, manageBillsTool, { action: "end", id: bill.id, end_date: "2026-08-01" });

    expect(candidates(ctx).map((c) => c.name)).toEqual(["Netflix"]);
  });

  it("audits confirms and declines and refuses them in read-only mode", async () => {
    const ctx = await synced(AIA_PAIR);
    const [life, health] = candidates(ctx);

    invokeTool(ctx, manageBillsTool, { action: "confirm", candidate_id: life!.candidate_id, name: "AIA life" });
    invokeTool(ctx, manageBillsTool, { action: "decline", candidate_id: health!.candidate_id });

    expect(ctx.db.select({ summary: auditLog.summary }).from(auditLog).all()).toEqual([
      { summary: "confirm bill AIA life" },
      { summary: "decline bill candidate AIA New Zealand $307.06" },
    ]);
    const fresh = await synced(AIA_PAIR);
    putSetting(fresh, "read_only", "true");
    expect(() => invokeTool(fresh, manageBillsTool, { action: "decline", candidate_id: life!.candidate_id })).toThrow(
      ReadOnlyError,
    );
  });
});

describe("Missed Bill occurrences (Seam 1)", () => {
  function create(ctx: AppContext, name: string, anchor: Record<string, unknown>, match_value = name) {
    invokeTool(ctx, manageBillsTool, {
      action: "create",
      name,
      cadence: "monthly",
      expected_amount_cents: 5000,
      match_type: "merchant",
      match_value,
      ...anchor,
    });
  }

  /** Bills created at `createdAt`, then the clock moves to Tue 20 Oct. */
  async function billsCreatedAt(createdAt: string, txns: Txn[], add: (ctx: AppContext) => void): Promise<AppContext> {
    let now = new Date(createdAt);
    const ctx = makeContext(openAndMigrate(":memory:"), () => now);
    const connectionId = seedConnection(ctx);
    await runSync(ctx, [{ connectionId, client: new FakeAkahuClient([sampleAccount()], txns) }]);
    add(ctx);
    now = new Date(TUE_20_OCT);
    return ctx;
  }

  it("lists each Bill's due dates in the Period that passed the overdue days with no debit", async () => {
    const netflix = sampleTransaction({ id: "n1", date: "2026-10-10", amount: -25.99, merchant: "Netflix" });
    const ctx = await billsCreatedAt("2026-09-01T00:00:00.000Z", [netflix], (ctx) => {
      create(ctx, "Gym", { day_of_month: 3 });
      create(ctx, "Netflix", { day_of_month: 10 });
      create(ctx, "Water", { day_of_month: 16 });
      create(ctx, "Education", { cadence: "weekly", weekday: "sunday" });
    });

    const listed = invokeTool(ctx, listBillsTool, {});

    expect(listed.period).toEqual({ key: "2026-10", start: "2026-10-01", end: "2026-10-31" });
    expect(listed.bills.map((b) => [b.name, b.missed_due_dates])).toEqual([
      ["Education", ["2026-10-04", "2026-10-11"]],
      ["Gym", ["2026-10-03"]],
      ["Netflix", []],
      ["Water", []],
    ]);
  });

  it("does not list due dates before the Bill was created", async () => {
    // 09:00 on Wed 30 Sep in Auckland; still 29 Sep in UTC.
    const ctx = await billsCreatedAt("2026-09-29T20:00:00.000Z", [], (ctx) => {
      create(ctx, "Gym", { day_of_month: 3 });
      create(ctx, "Water", { cadence: "weekly", weekday: "friday" });
    });

    expect(invokeTool(ctx, listBillsTool, { period: "2026-09" }).bills.map((b) => [b.name, b.missed_due_dates])).toEqual([
      ["Gym", []],
      ["Water", []],
    ]);
    expect(invokeTool(ctx, listBillsTool, {}).bills.map((b) => [b.name, b.missed_due_dates])).toEqual([
      ["Gym", ["2026-10-03"]],
      ["Water", ["2026-10-02", "2026-10-09"]],
    ]);
  });

  it("lists the missed due dates of an earlier Period", async () => {
    const ctx = await billsCreatedAt("2026-08-01T00:00:00.000Z", [], (ctx) => create(ctx, "Gym", { day_of_month: 3 }));

    expect(invokeTool(ctx, listBillsTool, { period: "2026-09" }).bills[0]!.missed_due_dates).toEqual(["2026-09-03"]);
  });
});
