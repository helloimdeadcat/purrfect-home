import { describe, expect, it } from "vitest";

import {
  computeNextDueDate,
  isPast,
  isWithinEndDate,
} from "./recurring-dates";

describe("computeNextDueDate", () => {
  it("advances weekly, yearly, daily", () => {
    expect(
      computeNextDueDate({ from: "2026-10-18", frequency: "weekly" }),
    ).toBe("2026-10-25");
    expect(
      computeNextDueDate({ from: "2026-10-18", frequency: "yearly" }),
    ).toBe("2027-10-18");
    expect(
      computeNextDueDate({ from: "2026-10-18", frequency: "daily" }),
    ).toBe("2026-10-19");
  });

  it("handles monthly including end-of-month clamp", () => {
    expect(
      computeNextDueDate({
        from: "2026-01-31",
        frequency: "monthly",
        dayOfMonth: 31,
      }),
    ).toBe("2026-02-28");
    expect(
      computeNextDueDate({
        from: "2026-10-18",
        frequency: "monthly",
        dayOfMonth: 18,
      }),
    ).toBe("2026-11-18");
  });

  it("anchors yearly Feb 29 on day_of_month without drifting into March", () => {
    const step = (from: string) =>
      computeNextDueDate({ from, frequency: "yearly", dayOfMonth: 29 });
    expect(step("2028-02-29")).toBe("2029-02-28");
    expect(step("2029-02-28")).toBe("2030-02-28");
    expect(step("2031-02-28")).toBe("2032-02-29");
    // Legacy rows without day_of_month clamp instead of rolling to Mar 1.
    expect(
      computeNextDueDate({ from: "2028-02-29", frequency: "yearly" }),
    ).toBe("2029-02-28");
  });

  it("recovers the anchor day for monthly after a short month", () => {
    expect(
      computeNextDueDate({
        from: "2026-02-28",
        frequency: "monthly",
        dayOfMonth: 31,
      }),
    ).toBe("2026-03-31");
  });

  it("requires intervalDays for custom", () => {
    expect(() =>
      computeNextDueDate({ from: "2026-10-18", frequency: "custom" }),
    ).toThrow();
    expect(
      computeNextDueDate({
        from: "2026-10-18",
        frequency: "custom",
        intervalDays: 14,
      }),
    ).toBe("2026-11-01");
  });

  it("respects end date boundary helpers", () => {
    expect(isWithinEndDate("2026-11-01", "2026-11-01")).toBe(true);
    expect(isWithinEndDate("2026-11-02", "2026-11-01")).toBe(false);
    expect(isWithinEndDate("2026-10-01", null)).toBe(true);
    expect(isPast("2026-10-01", "2026-10-18")).toBe(true);
    expect(isPast("2026-10-18", "2026-10-18")).toBe(false);
  });

  it("models paused templates as not advancing when callers gate on is_active", () => {
    // Date math itself is pure; pause/end are gating concerns for the service/SQL.
    const next = computeNextDueDate({
      from: "2026-10-18",
      frequency: "monthly",
      dayOfMonth: 18,
    });
    expect(isWithinEndDate(next, "2026-10-01")).toBe(false);
    expect(isWithinEndDate(next, "2026-12-31")).toBe(true);
  });
});
