import { describe, expect, it } from "vitest";

import {
  createGoalSchema,
  goalOperationSchema,
  updateGoalSchema,
} from "./goal";

describe("goal validations", () => {
  it("creates a goal with positive target", () => {
    const result = createGoalSchema.safeParse({
      name: "Vacation",
      targetAmount: "1500",
      currency: "eur",
      initialAmount: "100",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetAmount).toBe("1500.00");
      expect(result.data.currency).toBe("EUR");
      expect(result.data.initialAmount).toBe("100.00");
    }
  });

  it("rejects zero or negative target", () => {
    expect(
      createGoalSchema.safeParse({
        name: "Bad",
        targetAmount: "0",
      }).success,
    ).toBe(false);
  });

  it("rejects empty updates", () => {
    expect(updateGoalSchema.safeParse({}).success).toBe(false);
  });

  it("accepts deposit and adjust payloads", () => {
    expect(
      goalOperationSchema.safeParse({
        type: "deposit",
        amount: "50.00",
        note: "Payday",
      }).success,
    ).toBe(true);
    expect(
      goalOperationSchema.safeParse({
        type: "adjust",
        amount: "0",
      }).success,
    ).toBe(true);
  });
});
