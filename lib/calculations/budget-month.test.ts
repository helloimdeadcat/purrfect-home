import { describe, expect, it } from "vitest";

import {
  formatYearMonth,
  monthEndIso,
  monthStartIso,
  parseYearMonth,
  shiftYearMonth,
} from "./budget-month";

describe("budget month helpers", () => {
  it("builds month boundaries", () => {
    expect(monthStartIso(2026, 10)).toBe("2026-10-01");
    expect(monthEndIso(2026, 10)).toBe("2026-10-31");
    expect(monthEndIso(2026, 2)).toBe("2026-02-28");
  });

  it("parses and shifts months", () => {
    expect(parseYearMonth("2026-03")).toEqual({ year: 2026, month: 3 });
    expect(shiftYearMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(formatYearMonth(2026, 9)).toBe("2026-09");
  });
});
