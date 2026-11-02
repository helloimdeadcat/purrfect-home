import { describe, expect, it } from "vitest";

import { amountStep, describeFrequency, describeGoal, describeStreak, formatAmount } from "./describe";

describe("habit labels", () => {
  it("describes frequencies", () => {
    expect(describeFrequency({ kind: "daily" })).toBe("Каждый день");
    expect(describeFrequency({ kind: "days", weekdays: [5, 3, 1] })).toBe("Пн, Ср, Пт");
    expect(describeFrequency({ kind: "days", weekdays: [1, 2, 3, 4, 5] })).toBe("По будням");
    expect(describeFrequency({ kind: "days", weekdays: [7, 6] })).toBe("По выходным");
    expect(describeFrequency({ kind: "per_week", times: 3 })).toBe("3 раза в неделю");
    expect(describeFrequency({ kind: "per_week", times: 5 })).toBe("5 раз в неделю");
    expect(describeFrequency({ kind: "per_week", times: 1 })).toBe("Раз в неделю");
  });

  it("describes goals, streaks and steps", () => {
    expect(describeGoal({ kind: "check" })).toBeNull();
    expect(describeGoal({ kind: "count", target: 2, unit: "L" })).toBe("2 L в день");
    expect(describeGoal({ kind: "count", target: 10000, unit: null })).toBe("10000 в день");
    expect(describeStreak({ count: 0, unit: "days" })).toBe("Серии пока нет");
    expect(describeStreak({ count: 1, unit: "days" })).toBe("1 день подряд");
    expect(describeStreak({ count: 5, unit: "days" })).toBe("5 дней подряд");
    expect(describeStreak({ count: 3, unit: "weeks" })).toBe("3 недели подряд");
    expect(formatAmount(1.5)).toBe("1.5");
    expect(amountStep({ kind: "count", target: 2, unit: "L" })).toBe(1);
    expect(amountStep({ kind: "count", target: 1.5, unit: "L" })).toBe(0.25);
  });
});
