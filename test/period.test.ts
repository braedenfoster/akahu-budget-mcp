import { describe, expect, it } from "vitest";
import {
  daysLeftInPeriod,
  periodForDate,
  periodForMonth,
  periodFromKey,
  previousPeriod,
} from "../src/period.js";

describe("period math", () => {
  it("start day 1 is a plain calendar month", () => {
    expect(periodForMonth(2026, 7, 1)).toEqual({
      key: "2026-07",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
    // February leap-year length handled.
    expect(periodForMonth(2024, 2, 1).endDate).toBe("2024-02-29");
  });

  it("a non-1 start day shifts the window across the month boundary", () => {
    expect(periodForMonth(2026, 7, 15)).toEqual({
      key: "2026-07",
      startDate: "2026-07-15",
      endDate: "2026-08-14",
    });
  });

  it("assigns a date to the Period whose window contains it", () => {
    expect(periodForDate("2026-07-20", 15).key).toBe("2026-07");
    expect(periodForDate("2026-07-10", 15).key).toBe("2026-06");
    expect(periodForDate("2026-07-01", 1).key).toBe("2026-07");
  });

  it("parses a key and steps to the previous period", () => {
    expect(periodFromKey("2026-01", 1).startDate).toBe("2026-01-01");
    expect(previousPeriod(periodFromKey("2026-01", 1), 1).key).toBe("2025-12");
  });

  it("counts inclusive days left in a period", () => {
    const p = periodForMonth(2026, 7, 1);
    expect(daysLeftInPeriod(p, "2026-07-31")).toBe(1);
    expect(daysLeftInPeriod(p, "2026-07-25")).toBe(7);
    expect(daysLeftInPeriod(p, "2026-08-05")).toBe(0);
  });
});
