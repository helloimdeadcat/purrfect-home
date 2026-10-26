import { describe, expect, it } from "vitest";

import { forecastQuerySchema } from "@/lib/validations/forecast";

describe("forecastQuerySchema", () => {
  it("defaults horizon to end_of_month", () => {
    const parsed = forecastQuerySchema.parse({});
    expect(parsed.horizon).toBe("end_of_month");
  });

  it("uppercases currency", () => {
    const parsed = forecastQuerySchema.parse({ currency: "eur" });
    expect(parsed.currency).toBe("EUR");
  });

  it("requires to for custom horizon", () => {
    const result = forecastQuerySchema.safeParse({ horizon: "custom" });
    expect(result.success).toBe(false);
  });

  it("accepts custom with to", () => {
    const parsed = forecastQuerySchema.parse({
      horizon: "custom",
      to: "2026-11-01",
      from: "2026-10-18",
    });
    expect(parsed.to).toBe("2026-11-01");
  });
});
