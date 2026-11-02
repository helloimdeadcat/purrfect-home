import { describe, expect, it } from "vitest";

import { describeRepeat, describeTime, pluralRu } from "./describe";

describe("describeRepeat", () => {
  it("labels common rhythms", () => {
    expect(describeRepeat({ kind: "none" })).toBeNull();
    expect(describeRepeat({ kind: "daily", interval: 1 })).toBe("Каждый день");
    expect(describeRepeat({ kind: "daily", interval: 3 })).toBe("Раз в 3 дня");
    expect(describeRepeat({ kind: "daily", interval: 5 })).toBe("Раз в 5 дней");
    expect(describeRepeat({ kind: "weekly", interval: 1, weekdays: [5, 1, 2, 3, 4] })).toBe("По будням");
    expect(describeRepeat({ kind: "weekly", interval: 2, weekdays: [4, 2] })).toBe("Раз в 2 недели · Вт, Чт");
    expect(describeRepeat({ kind: "weekly", interval: 1, weekdays: [6] })).toBe("Каждую неделю · Сб");
    expect(describeRepeat({ kind: "monthly", interval: 1, dayOfMonth: 31 })).toBe("Каждый месяц, 31-го");
    expect(describeRepeat({ kind: "monthly", interval: 3, dayOfMonth: 2 })).toBe("Раз в 3 месяца, 2-го");
  });

  it("picks Russian plural forms", () => {
    expect(pluralRu(1, "день", "дня", "дней")).toBe("день");
    expect(pluralRu(21, "день", "дня", "дней")).toBe("день");
    expect(pluralRu(4, "день", "дня", "дней")).toBe("дня");
    expect(pluralRu(11, "день", "дня", "дней")).toBe("дней");
    expect(pluralRu(1.5, "день", "дня", "дней")).toBe("дня");
  });

  it("formats time ranges", () => {
    expect(describeTime("19:00", "20:30")).toBe("19:00–20:30");
    expect(describeTime("07:15", null)).toBe("07:15");
    expect(describeTime(null, null)).toBeNull();
  });
});
