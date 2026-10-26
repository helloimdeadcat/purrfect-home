import { describe, expect, it } from "vitest";

import { amountStep, describeFrequency, describeGoal, describeStreak, formatAmount } from "./describe";

describe("habit labels", () => {
  it("describes frequencies", () => {
    expect(describeFrequency({ kind: "daily" })).toBe("Every day");
    expect(describeFrequency({ kind: "days", weekdays: [5, 3, 1] })).toBe("Mon, Wed, Fri");
    expect(describeFrequency({ kind: "days", weekdays: [1, 2, 3, 4, 5] })).toBe("Weekdays");
    expect(describeFrequency({ kind: "days", weekdays: [7, 6] })).toBe("Weekends");
    expect(describeFrequency({ kind: "per_week", times: 3 })).toBe("3× a week");
    expect(describeFrequency({ kind: "per_week", times: 1 })).toBe("Once a week");
  });

  it("describes goals, streaks and steps", () => {
    expect(describeGoal({ kind: "check" })).toBeNull();
    expect(describeGoal({ kind: "count", target: 2, unit: "L" })).toBe("2 L a day");
    expect(describeGoal({ kind: "count", target: 10000, unit: null })).toBe("10000 a day");
    expect(describeStreak({ count: 0, unit: "days" })).toBe("No streak yet");
    expect(describeStreak({ count: 1, unit: "days" })).toBe("1 day in a row");
    expect(describeStreak({ count: 3, unit: "weeks" })).toBe("3 weeks in a row");
    expect(formatAmount(1.5)).toBe("1.5");
    expect(amountStep({ kind: "count", target: 2, unit: "L" })).toBe(1);
    expect(amountStep({ kind: "count", target: 1.5, unit: "L" })).toBe(0.25);
  });
});
