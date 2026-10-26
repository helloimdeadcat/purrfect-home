import { describe, expect, it } from "vitest";

import { listRecurringDatesInRange } from "./recurring-dates";

describe("listRecurringDatesInRange", () => {
  it("lists monthly dates inside a month", () => {
    expect(
      listRecurringDatesInRange(
        {
          startDate: "2026-10-07",
          frequency: "monthly",
          dayOfMonth: 7,
        },
        "2026-10-01",
        "2026-10-31",
      ),
    ).toEqual(["2026-10-07"]);

    expect(
      listRecurringDatesInRange(
        {
          startDate: "2026-10-07",
          frequency: "monthly",
          dayOfMonth: 7,
        },
        "2026-11-01",
        "2026-11-30",
      ),
    ).toEqual(["2026-11-07"]);
  });

  it("respects end date and empty ranges", () => {
    expect(
      listRecurringDatesInRange(
        {
          startDate: "2026-10-07",
          endDate: "2026-10-07",
          frequency: "monthly",
          dayOfMonth: 7,
        },
        "2026-11-01",
        "2026-11-30",
      ),
    ).toEqual([]);

    expect(
      listRecurringDatesInRange(
        {
          startDate: "2026-10-07",
          frequency: "weekly",
        },
        "2026-10-01",
        "2026-10-31",
      ),
    ).toEqual(["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"]);
  });
});
