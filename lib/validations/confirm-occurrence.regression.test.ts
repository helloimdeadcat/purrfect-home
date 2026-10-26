import { describe, expect, it } from "vitest";

import { confirmOccurrenceSchema } from "./recurring";

/**
 * Regression: overdue expense confirm with amount 100.00.
 *
 * Live failure (2026-10-18): POST /api/recurring/occurrences/.../confirm → 400
 * body: { error: "Validation failed", details: Zod flatten }
 *
 * Root cause: UI seeded Confirm amount from PostgREST numeric `amount: 100`
 * (JSON number). confirmOccurrenceSchema used z.string()-only money schema,
 * so Zod rejected the payload before the RPC ran. Overdue dates were never
 * the rejection reason (RPC allows pending|overdue).
 */
describe("confirm overdue expense regression", () => {
  it("accepts overdue confirm payload with numeric and string 100.00", () => {
    for (const amount of [100, 100.0, "100", "100.00"] as const) {
      const result = confirmOccurrenceSchema.safeParse({ amount });
      expect(result.success, String(amount)).toBe(true);
      if (result.success) {
        expect(result.data.amount).toBe("100.00");
      }
    }
  });

  it("accepts empty body (template amount used server-side) and notes null", () => {
    expect(confirmOccurrenceSchema.safeParse({}).success).toBe(true);
    expect(
      confirmOccurrenceSchema.safeParse({
        amount: "100.00",
        notes: null,
        transactionDate: null,
      }).success,
    ).toBe(true);
  });

  it("rejects invalid and zero amounts without disabling validation", () => {
    expect(confirmOccurrenceSchema.safeParse({ amount: "abc" }).success).toBe(
      false,
    );
    expect(confirmOccurrenceSchema.safeParse({ amount: "0" }).success).toBe(
      false,
    );
    expect(confirmOccurrenceSchema.safeParse({ amount: -5 }).success).toBe(
      false,
    );
  });

  it("does not treat an overdue scheduled_date as a confirm field", () => {
    // Confirm body has no scheduled_date; overdue is an occurrence status on the server.
    const result = confirmOccurrenceSchema.safeParse({
      amount: "100.00",
      transactionDate: "2026-10-07",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transactionDate).toBe("2026-10-07");
    }
  });
});
