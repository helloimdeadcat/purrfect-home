import { describe, expect, it } from "vitest";

import { describeRepeat, describeTime } from "./describe";

describe("describeRepeat", () => {
  it("labels common rhythms", () => {
    expect(describeRepeat({ kind: "none" })).toBeNull();
    expect(describeRepeat({ kind: "daily", interval: 1 })).toBe("Every day");
    expect(describeRepeat({ kind: "daily", interval: 3 })).toBe("Every 3 days");
    expect(describeRepeat({ kind: "weekly", interval: 1, weekdays: [5, 1, 2, 3, 4] })).toBe("Weekdays");
    expect(describeRepeat({ kind: "weekly", interval: 2, weekdays: [4, 2] })).toBe("Every 2 weeks · Tue, Thu");
    expect(describeRepeat({ kind: "weekly", interval: 1, weekdays: [6] })).toBe("Weekly · Sat");
    expect(describeRepeat({ kind: "monthly", interval: 1, dayOfMonth: 31 })).toBe("Monthly on the 31st");
    expect(describeRepeat({ kind: "monthly", interval: 3, dayOfMonth: 2 })).toBe("Every 3 months on the 2nd");
  });

  it("formats time ranges", () => {
    expect(describeTime("19:00", "20:30")).toBe("19:00–20:30");
    expect(describeTime("07:15", null)).toBe("07:15");
    expect(describeTime(null, null)).toBeNull();
  });
});
