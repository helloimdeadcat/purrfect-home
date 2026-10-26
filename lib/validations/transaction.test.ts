import { describe, expect, it } from "vitest";

import { createTransactionSchema } from "./transaction";

const ACCOUNT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("createTransactionSchema", () => {
  it("requires adjustmentDirection for adjustments", () => {
    const result = createTransactionSchema.safeParse({
      accountId: ACCOUNT_ID,
      type: "adjustment",
      amount: "10.00",
      transactionDate: "2026-10-17",
    });
    expect(result.success).toBe(false);
  });

  it("accepts adjustment with direction", () => {
    const result = createTransactionSchema.safeParse({
      accountId: ACCOUNT_ID,
      type: "adjustment",
      amount: "10.00",
      transactionDate: "2026-10-17",
      adjustmentDirection: "decrease",
    });
    if (!result.success) {
      // Helpful failure detail for Zod refinements
      expect(result.error.issues).toEqual([]);
    }
    expect(result.success).toBe(true);
  });

  it("rejects adjustmentDirection on expense", () => {
    const result = createTransactionSchema.safeParse({
      accountId: ACCOUNT_ID,
      type: "expense",
      amount: "10.00",
      transactionDate: "2026-10-17",
      adjustmentDirection: "increase",
    });
    expect(result.success).toBe(false);
  });
});
