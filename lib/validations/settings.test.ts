import { describe, expect, it } from "vitest";

import {
  createCategorySchema,
  createIncomeSourceSchema,
  createTagSchema,
  updateHouseholdSettingsSchema,
  updateProfileSchema,
} from "./settings";

describe("safe-to-spend reserves", () => {
  it("normalises amounts, upper-cases codes and drops zero entries", () => {
    const parsed = updateHouseholdSettingsSchema.parse({
      safeToSpendReserves: { eur: "500", USD: "0", GBP: "12,5" },
    });
    expect(parsed.safeToSpendReserves).toEqual({ EUR: "500.00", GBP: "12.50" });
  });

  it("rejects negative amounts and bad codes", () => {
    expect(
      updateHouseholdSettingsSchema.safeParse({ safeToSpendReserves: { EUR: "-1" } }).success,
    ).toBe(false);
    expect(
      updateHouseholdSettingsSchema.safeParse({ safeToSpendReserves: { EURO: "1" } }).success,
    ).toBe(false);
  });
});

describe("settings validations", () => {
  it("accepts profile and household preference updates", () => {
    expect(
      updateProfileSchema.safeParse({
        firstName: "Ada",
        currency: "eur",
      }).success,
    ).toBe(true);
    expect(
      updateHouseholdSettingsSchema.safeParse({
        timezone: "Europe/Berlin",
        weekStartsOn: 1,
      }).success,
    ).toBe(true);
    expect(updateHouseholdSettingsSchema.safeParse({}).success).toBe(false);
  });

  it("validates categories and tags", () => {
    expect(
      createCategorySchema.safeParse({
        name: "Groceries",
        type: "expense",
      }).success,
    ).toBe(true);
    expect(
      createCategorySchema.safeParse({ name: "  ", type: "expense" }).success,
    ).toBe(false);
    expect(createTagSchema.safeParse({ name: "shared" }).success).toBe(true);
  });

  it("validates income sources", () => {
    expect(
      createIncomeSourceSchema.safeParse({
        name: "Salary",
        amount: "2500",
        frequency: "monthly",
        nextDate: "2026-11-01",
        accountId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      }).success,
    ).toBe(true);
  });
});
