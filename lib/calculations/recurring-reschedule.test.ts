import { describe, expect, it } from "vitest";

import { planReschedule, scheduleActuallyChanged } from "./recurring-reschedule";

const monthlyOn = (day: number) => ({
  startDate: "2026-01-01",
  endDate: null,
  frequency: "monthly" as const,
  dayOfMonth: day,
});

describe("planReschedule", () => {
  it("supersedes the old slot and moves next due when the day changes", () => {
    const plan = planReschedule({
      template: monthlyOn(15),
      today: "2026-10-26",
      futurePending: [{ id: "nov1", scheduled_date: "2026-11-01" }],
    });
    expect(plan).toEqual({ supersedeIds: ["nov1"], reviveIds: [], nextDue: "2026-11-15" });
  });

  it("revives a previously superseded slot when the edit is reverted", () => {
    const plan = planReschedule({
      template: monthlyOn(1),
      today: "2026-10-26",
      futurePending: [{ id: "nov15", scheduled_date: "2026-11-15" }],
      futureSuperseded: [{ id: "nov1", scheduled_date: "2026-11-01" }],
    });
    expect(plan).toEqual({ supersedeIds: ["nov15"], reviveIds: ["nov1"], nextDue: "2026-11-01" });
  });

  it("keeps a pending occurrence that still matches the schedule", () => {
    // Only the end date changed: Nov 1 is still a valid date.
    const plan = planReschedule({
      template: { ...monthlyOn(1), endDate: "2027-06-30" },
      today: "2026-10-26",
      futurePending: [{ id: "nov1", scheduled_date: "2026-11-01" }],
    });
    expect(plan).toEqual({ supersedeIds: [], reviveIds: [], nextDue: "2026-11-01" });
  });

  it("supersedes occurrences after a shortened end date and reports no next date", () => {
    const plan = planReschedule({
      template: { ...monthlyOn(1), endDate: "2026-10-31" },
      today: "2026-10-26",
      futurePending: [{ id: "nov1", scheduled_date: "2026-11-01" }],
    });
    expect(plan).toEqual({ supersedeIds: ["nov1"], reviveIds: [], nextDue: null });
  });
});

describe("scheduleActuallyChanged", () => {
  const existing = {
    frequency: "monthly",
    interval_days: null,
    day_of_month: 1,
    weekday: null,
    end_date: null,
  };

  it("ignores resent identical values (rename-only edit)", () => {
    expect(
      scheduleActuallyChanged(existing, {
        frequency: "monthly",
        intervalDays: null,
        endDate: null,
      }),
    ).toBe(false);
  });

  it("detects real changes", () => {
    expect(scheduleActuallyChanged(existing, { frequency: "weekly" })).toBe(true);
    expect(scheduleActuallyChanged(existing, { dayOfMonth: 15 })).toBe(true);
    expect(scheduleActuallyChanged(existing, { endDate: "2027-01-01" })).toBe(true);
  });

  it("ignores interval days unless the schedule is custom", () => {
    expect(scheduleActuallyChanged(existing, { intervalDays: 10 })).toBe(false);
    expect(
      scheduleActuallyChanged({ ...existing, frequency: "custom", interval_days: 14 }, { intervalDays: 10 }),
    ).toBe(true);
  });
});
