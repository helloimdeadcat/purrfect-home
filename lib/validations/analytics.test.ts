import { describe, expect, it } from "vitest";

import { analyticsQuerySchema } from "./analytics";

describe("analyticsQuerySchema", () => {
  it("defaults period and uppercases currency", () => {
    const result = analyticsQuerySchema.parse({ currency: "eur" });
    expect(result.period).toBe("current_month");
    expect(result.currency).toBe("EUR");
  });

  it("requires from/to for custom period", () => {
    expect(
      analyticsQuerySchema.safeParse({ period: "custom" }).success,
    ).toBe(false);
    expect(
      analyticsQuerySchema.safeParse({
        period: "custom",
        from: "2026-01-01",
        to: "2026-01-31",
      }).success,
    ).toBe(true);
  });
});
