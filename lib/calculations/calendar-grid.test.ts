import { describe, expect, it } from "vitest";

import { buildMonthGrid, dayIso } from "./calendar-grid";

describe("calendar grid", () => {
  it("builds Monday-first October 2026 grid", () => {
    // 2026-10-01 is Thursday → Mon-first padding = 3
    const rows = buildMonthGrid(2026, 10);
    expect(rows[0]).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(rows.at(-1)?.filter((d) => d != null).at(-1)).toBe(31);
    expect(dayIso(2026, 10, 7)).toBe("2026-10-07");
  });
});
