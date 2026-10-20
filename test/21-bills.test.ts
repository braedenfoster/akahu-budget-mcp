import { describe, expect, it } from "vitest";
import { getUpcomingBillsTool, listBillsTool, manageBillsTool } from "../src/tools/bills.js";
import { invokeTool } from "../src/tools/types.js";
import { putSetting, SETTING_LAST_SYNC_AT, type AppContext } from "../src/context.js";
import { auditLog } from "../src/db/schema.js";
import { ReadOnlyError } from "../src/write.js";
import { testContext } from "./helpers.js";

// 09:00 on Tue 20 Oct 2026 in Auckland (NZDT, UTC+13).
const TUE_20_OCT = "2026-10-19T20:00:00.000Z";

const POWER = {
  action: "create",
  name: "Power",
  cadence: "monthly",
  day_of_month: 22,
  expected_amount_cents: 21200,
  match_type: "merchant",
  match_value: "Contact Energy",
} as const;

/** About midday in Auckland on the given date: 00:00 UTC is 12:00 NZST or 13:00 NZDT. */
function middayInNz(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function createBill(ctx: AppContext, overrides: Record<string, unknown>) {
  return invokeTool(ctx, manageBillsTool, { ...POWER, ...overrides });
}

const EDUCATION = { name: "Education", cadence: "weekly", day_of_month: undefined, weekday: "sunday", expected_amount_cents: 25000 };

function dueDates(ctx: AppContext): string[] {
  return invokeTool(ctx, getUpcomingBillsTool, {}).occurrences.map((o) => o.due_date);
}

describe("Bills (Seam 1)", () => {
  it("lists a hand-entered Bill", () => {
    const ctx = testContext(TUE_20_OCT);

    const created = invokeTool(ctx, manageBillsTool, POWER);

    expect(invokeTool(ctx, listBillsTool, {}).bills).toEqual([created]);
    expect(created).toMatchObject({
      name: "Power",
      cadence: "monthly",
      day_of_month: 22,
      weekday: null,
      anchor_date: null,
      amount_mode: "fixed",
      expected_amount_cents: 21200,
      expected_amount_display: "$212.00",
      match_type: "merchant",
      match_value: "Contact Energy",
      status: "active",
      end_date: null,
    });
  });

  it("shows an upcoming Bill occurrence in the Bills view", () => {
    const ctx = testContext(TUE_20_OCT);
    const power = invokeTool(ctx, manageBillsTool, POWER);

    expect(invokeTool(ctx, getUpcomingBillsTool, {})).toEqual({
      occurrences: [
        {
          bill_id: power.id,
          name: "Power",
          due_date: "2026-10-22",
          state: "upcoming",
          amount_cents: 21200,
          amount_display: "$212.00",
          estimated: false,
        },
      ],
      today: [],
      next_upcoming: {
        bill_id: power.id,
        name: "Power",
        due_date: "2026-10-22",
        state: "upcoming",
        amount_cents: 21200,
        amount_display: "$212.00",
        estimated: false,
      },
      due_total_cents: 21200,
      due_total_display: "$212.00",
      data_as_of: null,
      stale: true,
    });
  });

  it("moves a missing day of the month to the last day of that month", () => {
    const ctx = testContext(middayInNz("2026-11-27"));
    createBill(ctx, { day_of_month: 31 });

    expect(dueDates(ctx)).toEqual(["2026-11-30"]);
  });

  it("moves the 29th, 30th and 31st to 28 February in a common year", () => {
    const ctx = testContext(middayInNz("2027-02-25"));
    createBill(ctx, { name: "29th", day_of_month: 29 });
    createBill(ctx, { name: "30th", day_of_month: 30 });
    createBill(ctx, { name: "31st", day_of_month: 31 });

    expect(dueDates(ctx)).toEqual(["2027-02-28", "2027-02-28", "2027-02-28"]);
  });

  it("makes a weekly Bill due on its weekday", () => {
    const ctx = testContext(TUE_20_OCT);
    const created = createBill(ctx, { cadence: "weekly", day_of_month: undefined, weekday: "wednesday" });

    expect(created).toMatchObject({ weekday: "wednesday", day_of_month: null });
    expect(dueDates(ctx)).toEqual(["2026-10-21"]);
  });

  it("makes a fortnightly Bill due every 14 days from its anchor date, before or after it", () => {
    const ctx = testContext(TUE_20_OCT);
    const fortnightly = { cadence: "fortnightly", day_of_month: undefined };
    createBill(ctx, { ...fortnightly, name: "Past anchor", anchor_date: "2026-09-23" });
    createBill(ctx, { ...fortnightly, name: "Future anchor", anchor_date: "2026-11-05" });

    expect(dueDates(ctx)).toEqual(["2026-10-21", "2026-10-22"]);
  });

  it("keeps a quarterly Bill on its anchor day after a shorter month", () => {
    const ctx = testContext(middayInNz("2026-10-27"));
    const quarterly = { cadence: "quarterly", day_of_month: undefined };
    createBill(ctx, { ...quarterly, name: "Due this week", anchor_date: "2026-01-31" });
    createBill(ctx, { ...quarterly, name: "Due in December", anchor_date: "2026-03-15" });

    expect(dueDates(ctx)).toEqual(["2026-10-31"]);
  });

  it("makes a yearly Bill anchored on 29 February due on 28 February in a common year", () => {
    const ctx = testContext(middayInNz("2027-02-25"));
    createBill(ctx, { cadence: "yearly", day_of_month: undefined, anchor_date: "2024-02-29" });

    expect(dueDates(ctx)).toEqual(["2027-02-28"]);
  });

  it("makes a yearly Bill due on its anchor date each year", () => {
    const ctx = testContext(TUE_20_OCT);
    createBill(ctx, { cadence: "yearly", day_of_month: undefined, anchor_date: "2025-10-24" });

    expect(dueDates(ctx)).toEqual(["2026-10-24"]);
  });

  it("dates today in the Household time zone just after midnight", () => {
    // 00:01 on Wed 21 Oct in Auckland; still 20 Oct in UTC.
    const ctx = testContext("2026-10-20T11:01:00.000Z");
    createBill(ctx, { name: "Due today", day_of_month: 21 });
    createBill(ctx, { name: "Last day of the week", day_of_month: 27 });

    const view = invokeTool(ctx, getUpcomingBillsTool, {});

    expect(view.occurrences.map((o) => [o.name, o.due_date, o.state])).toEqual([
      ["Due today", "2026-10-21", "due"],
      ["Last day of the week", "2026-10-27", "upcoming"],
    ]);
  });

  it("gives each occurrence a state by its day offset and keeps the week from today - 5 to today + 6", () => {
    const ctx = testContext(TUE_20_OCT);
    for (let day = 14; day <= 27; day++) createBill(ctx, { name: `Day ${day}`, day_of_month: day });

    const view = invokeTool(ctx, getUpcomingBillsTool, {});

    expect(view.occurrences.map((o) => [o.due_date, o.state])).toEqual([
      ["2026-10-15", "overdue"],
      ["2026-10-16", "overdue"],
      ["2026-10-17", "overdue"],
      ["2026-10-18", "due"],
      ["2026-10-19", "due"],
      ["2026-10-20", "due"],
      ["2026-10-21", "upcoming"],
      ["2026-10-22", "upcoming"],
      ["2026-10-23", "upcoming"],
      ["2026-10-24", "upcoming"],
      ["2026-10-25", "upcoming"],
      ["2026-10-26", "upcoming"],
    ]);
    expect(view.today.map((o) => o.due_date)).toEqual([
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
      "2026-10-20",
    ]);
  });

  it("looks past the week for the next upcoming occurrence", () => {
    const ctx = testContext(TUE_20_OCT);
    createBill(ctx, { name: "Due today", cadence: "yearly", day_of_month: undefined, anchor_date: "2025-10-20" });
    createBill(ctx, { name: "Rates", cadence: "quarterly", day_of_month: undefined, anchor_date: "2026-03-15" });
    createBill(ctx, { name: "Car registration", cadence: "yearly", day_of_month: undefined, anchor_date: "2027-01-10" });

    const view = invokeTool(ctx, getUpcomingBillsTool, {});

    expect(view.occurrences.map((o) => o.name)).toEqual(["Due today"]);
    expect(view.next_upcoming).toMatchObject({ name: "Rates", due_date: "2026-12-15", state: "upcoming" });
  });

  it("has no next upcoming occurrence without Bills", () => {
    const ctx = testContext(TUE_20_OCT);

    expect(invokeTool(ctx, getUpcomingBillsTool, {})).toMatchObject({
      occurrences: [],
      today: [],
      next_upcoming: null,
      due_total_cents: 0,
      due_total_display: "$0.00",
    });
  });

  it("totals every occurrence in the week list, overdue ones included", () => {
    const ctx = testContext(TUE_20_OCT);
    createBill(ctx, POWER);
    createBill(ctx, { name: "Water", day_of_month: 16, expected_amount_cents: 8550 });
    createBill(ctx, EDUCATION);

    const view = invokeTool(ctx, getUpcomingBillsTool, {});

    expect(view.occurrences.map((o) => [o.name, o.due_date, o.state])).toEqual([
      ["Water", "2026-10-16", "overdue"],
      ["Education", "2026-10-18", "due"],
      ["Power", "2026-10-22", "upcoming"],
      ["Education", "2026-10-25", "upcoming"],
    ]);
    expect(view).toMatchObject({ due_total_cents: 79750, due_total_display: "$797.50" });
  });

  it("makes no occurrences after an ended Bill's end date", () => {
    const ctx = testContext(TUE_20_OCT);
    const education = createBill(ctx, EDUCATION);

    const ended = invokeTool(ctx, manageBillsTool, { action: "end", id: education.id, end_date: "2026-10-19" });

    expect(ended).toMatchObject({ status: "ended", end_date: "2026-10-19" });
    expect(invokeTool(ctx, getUpcomingBillsTool, {})).toMatchObject({
      occurrences: [{ name: "Education", due_date: "2026-10-18", state: "due" }],
      next_upcoming: null,
    });
  });

  it("ends a Bill today when no end date is given", () => {
    const ctx = testContext(TUE_20_OCT);
    const power = createBill(ctx, POWER);

    expect(invokeTool(ctx, manageBillsTool, { action: "end", id: power.id })).toMatchObject({
      status: "ended",
      end_date: "2026-10-20",
    });
  });

  it("lists ended Bills only when asked", () => {
    const ctx = testContext(TUE_20_OCT);
    createBill(ctx, POWER);
    const gym = createBill(ctx, { name: "Gym", day_of_month: 3, expected_amount_cents: 8600 });
    invokeTool(ctx, manageBillsTool, { action: "end", id: gym.id, end_date: "2026-09-03" });

    expect(invokeTool(ctx, listBillsTool, {}).bills.map((b) => b.name)).toEqual(["Power"]);
    expect(
      invokeTool(ctx, listBillsTool, { include_ended: true }).bills.map((b) => [b.name, b.status]),
    ).toEqual([
      ["Gym", "ended"],
      ["Power", "active"],
    ]);
  });

  it("edits a Bill and keeps the fields not given", () => {
    const ctx = testContext(TUE_20_OCT);
    const power = createBill(ctx, POWER);

    const edited = invokeTool(ctx, manageBillsTool, {
      action: "edit",
      id: power.id,
      name: "Electricity",
      day_of_month: 25,
    });

    expect(edited).toEqual({ ...power, name: "Electricity", day_of_month: 25 });
    expect(invokeTool(ctx, listBillsTool, {}).bills).toEqual([edited]);
    expect(dueDates(ctx)).toEqual(["2026-10-25"]);
  });

  it("drops the old anchor when an edit changes the cadence", () => {
    const ctx = testContext(TUE_20_OCT);
    const power = createBill(ctx, POWER);

    const edited = invokeTool(ctx, manageBillsTool, {
      action: "edit",
      id: power.id,
      cadence: "weekly",
      weekday: "friday",
    });

    expect(edited).toMatchObject({ cadence: "weekly", weekday: "friday", day_of_month: null });
    expect(dueDates(ctx)).toEqual(["2026-10-16", "2026-10-23"]);
  });

  it("refuses to edit an ended Bill", () => {
    const ctx = testContext(TUE_20_OCT);
    const power = createBill(ctx, POWER);
    invokeTool(ctx, manageBillsTool, { action: "end", id: power.id });

    expect(() => invokeTool(ctx, manageBillsTool, { action: "edit", id: power.id, name: "Electricity" })).toThrow(
      /ended/,
    );
  });

  it("refuses a Bill without the anchor its cadence takes", () => {
    const ctx = testContext(TUE_20_OCT);

    expect(() => createBill(ctx, { day_of_month: undefined })).toThrow("monthly Bills need `day_of_month`.");
    expect(() => createBill(ctx, { cadence: "weekly" })).toThrow("weekly Bills take `weekday`, not `day_of_month`.");
    expect(invokeTool(ctx, listBillsTool, {}).bills).toEqual([]);
  });

  it("refuses to end an ended Bill", () => {
    const ctx = testContext(TUE_20_OCT);
    const power = createBill(ctx, POWER);
    invokeTool(ctx, manageBillsTool, { action: "end", id: power.id, end_date: "2026-10-01" });

    expect(() => invokeTool(ctx, manageBillsTool, { action: "end", id: power.id })).toThrow(/ended/);
    expect(invokeTool(ctx, listBillsTool, { include_ended: true }).bills[0]!.end_date).toBe("2026-10-01");
  });

  it("audits each change and refuses changes in read-only mode", () => {
    const ctx = testContext(TUE_20_OCT);
    const power = createBill(ctx, POWER);
    invokeTool(ctx, manageBillsTool, { action: "edit", id: power.id, expected_amount_cents: 23000 });
    invokeTool(ctx, manageBillsTool, { action: "end", id: power.id });

    expect(ctx.db.select({ summary: auditLog.summary }).from(auditLog).all()).toEqual([
      { summary: "create bill Power" },
      { summary: `edit bill ${power.id} Power` },
      { summary: `end bill ${power.id} Power on 2026-10-20` },
    ]);

    putSetting(ctx, "read_only", "true");
    expect(() => createBill(ctx, { name: "Water" })).toThrow(ReadOnlyError);
  });

  it("carries the same data-as-of and stale flag as the Spending allowance", () => {
    const ctx = testContext(TUE_20_OCT);
    putSetting(ctx, SETTING_LAST_SYNC_AT, "2026-10-19T15:00:00.000Z");

    expect(invokeTool(ctx, getUpcomingBillsTool, {})).toMatchObject({
      data_as_of: "2026-10-19T15:00:00.000Z",
      stale: false,
    });
  });
});
