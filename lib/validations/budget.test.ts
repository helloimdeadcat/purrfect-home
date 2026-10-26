import { describe, expect, it } from "vitest";

import { createBudgetSchema, updateBudgetSchema } from "./budget";

const CATEGORY_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("budget validations", () => {
  it("requires positive amount and category", () => {
    expect(
      createBudgetSchema.safeParse({
        categoryId: CATEGORY_ID,
        amount: "0",
      }).success,
    ).toBe(false);

    expect(
      createBudgetSchema.safeParse({
        categoryId: "not-a-uuid",
        amount: "10.00",
      }).success,
    ).toBe(false);
  });

  it("accepts monthly budget create payload", () => {
    const result = createBudgetSchema.safeParse({
      categoryId: CATEGORY_ID,
      amount: "150.5",
      month: "2026-10",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe("150.50");
    }
  });

  it("rejects empty updates", () => {
    expect(updateBudgetSchema.safeParse({}).success).toBe(false);
  });
});
