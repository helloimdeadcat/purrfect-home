import { describe, expect, it } from "vitest";

import {
  confirmOccurrenceSchema,
  createRecurringSchema,
  updateRecurringSchema,
} from "./recurring";

const IDS = {
  category: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  account: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
};

describe("recurring validations", () => {
  it("creates monthly expense template", () => {
    const result = createRecurringSchema.safeParse({
      name: "Rent",
      type: "expense",
      amount: "900",
      categoryId: IDS.category,
      accountId: IDS.account,
      frequency: "monthly",
      startDate: "2026-11-01",
    });
    expect(result.success).toBe(true);
  });

  it("requires intervalDays for custom frequency", () => {
    const result = createRecurringSchema.safeParse({
      name: "Custom",
      type: "expense",
      amount: "10.00",
      categoryId: IDS.category,
      accountId: IDS.account,
      frequency: "custom",
      startDate: "2026-11-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty updates", () => {
    expect(updateRecurringSchema.safeParse({}).success).toBe(false);
  });

  it("accepts confirm payload with optional amount override", () => {
    expect(
      confirmOccurrenceSchema.safeParse({ amount: "95.50" }).success,
    ).toBe(true);
    expect(confirmOccurrenceSchema.safeParse({ amount: 100 }).success).toBe(
      true,
    );
    expect(confirmOccurrenceSchema.safeParse({ amount: "100" }).success).toBe(
      true,
    );
    expect(
      confirmOccurrenceSchema.safeParse({
        amount: "100.00",
        notes: null,
      }).success,
    ).toBe(true);
    expect(confirmOccurrenceSchema.safeParse({}).success).toBe(true);
  });
});
