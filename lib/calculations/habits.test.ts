import { describe, expect, it } from "vitest";

import {
  canCheckIn,
  completionRate,
  currentStreak,
  dayStatus,
  weekCount,
  type HabitRules,
} from "./habits";

const TODAY = "2026-10-26"; // Monday

const daily: HabitRules = { startDate: "2026-09-01", frequency: { kind: "daily" }, goal: { kind: "check" } };
const map = (dates: string[], value = 1) => new Map(dates.map((d) => [d, value]));

describe("currentStreak", () => {
  it("counts consecutive done days; an unfinished today does not break it", () => {
    const checkins = map(["2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(currentStreak(daily, checkins, TODAY)).toEqual({ count: 3, unit: "days" });
    checkins.set(TODAY, 1);
    expect(currentStreak(daily, checkins, TODAY)).toEqual({ count: 4, unit: "days" });
  });

  it("breaks on a missed day", () => {
    expect(currentStreak(daily, map(["2026-10-22", "2026-10-25"]), TODAY).count).toBe(1);
  });

  it("skips unscheduled days for weekday habits", () => {
    const gym: HabitRules = { ...daily, frequency: { kind: "days", weekdays: [1, 3, 5] } };
    // Fri 23, Wed 21, Mon 19 done; weekend not scheduled; today (Mon) still open.
    expect(currentStreak(gym, map(["2026-10-19", "2026-10-21", "2026-10-23"]), TODAY).count).toBe(3);
  });

  it("counts weeks for N-times-a-week habits", () => {
    const run: HabitRules = { ...daily, frequency: { kind: "per_week", times: 2 } };
    const checkins = map(["2026-10-13", "2026-10-15", "2026-10-20", "2026-10-24"]);
    expect(currentStreak(run, checkins, TODAY)).toEqual({ count: 2, unit: "weeks" });
    checkins.set(TODAY, 1);
    checkins.set("2026-10-27", 1);
    expect(currentStreak(run, checkins, "2026-10-27")).toEqual({ count: 3, unit: "weeks" });
  });

  it("count habits are done only at the target", () => {
    const water: HabitRules = { ...daily, goal: { kind: "count", target: 2, unit: "L" } };
    const checkins = new Map([
      ["2026-10-24", 2],
      ["2026-10-25", 1.5],
    ]);
    expect(currentStreak(water, checkins, TODAY).count).toBe(0);
  });
});

describe("dayStatus", () => {
  const water: HabitRules = { ...daily, goal: { kind: "count", target: 2, unit: "L" } };
  it("distinguishes done, partial, missed, open and off", () => {
    const checkins = new Map([
      ["2026-10-24", 2],
      ["2026-10-25", 0.5],
    ]);
    expect(dayStatus(water, checkins, "2026-10-24", TODAY)).toBe("done");
    expect(dayStatus(water, checkins, "2026-10-25", TODAY)).toBe("partial");
    expect(dayStatus(water, checkins, "2026-10-23", TODAY)).toBe("missed");
    expect(dayStatus(water, checkins, TODAY, TODAY)).toBe("open");
    expect(dayStatus(water, checkins, "2026-10-27", TODAY)).toBe("off");
    expect(dayStatus(water, checkins, "2026-08-31", TODAY)).toBe("off");
  });

  it("never marks single days missed for per-week habits", () => {
    const run: HabitRules = { ...daily, frequency: { kind: "per_week", times: 3 } };
    expect(dayStatus(run, new Map(), "2026-10-24", TODAY)).toBe("off");
  });
});

describe("weekCount and completionRate", () => {
  it("counts this ISO week's completions", () => {
    const run: HabitRules = { ...daily, frequency: { kind: "per_week", times: 3 } };
    expect(weekCount(run, map(["2026-10-25", TODAY, "2026-10-27"]), TODAY)).toBe(2);
  });

  it("excludes an unfinished today from the rate", () => {
    const start: HabitRules = { ...daily, startDate: "2026-10-23" };
    // 23 done, 24 missed, 25 done, today open → 2 of 3
    expect(completionRate(start, map(["2026-10-23", "2026-10-25"]), TODAY)).toBeCloseTo(2 / 3);
    expect(completionRate({ ...daily, startDate: TODAY }, new Map(), TODAY)).toBeNull();
  });
});

describe("canCheckIn", () => {
  it("allows today and up to a week back, never the future", () => {
    expect(canCheckIn(TODAY, TODAY)).toBe(true);
    expect(canCheckIn("2026-10-19", TODAY)).toBe(true);
    expect(canCheckIn("2026-10-18", TODAY)).toBe(false);
    expect(canCheckIn("2026-10-27", TODAY)).toBe(false);
  });
});
