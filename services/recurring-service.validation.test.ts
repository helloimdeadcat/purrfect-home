import { describe, expect, it, vi } from "vitest";

import type { HouseholdContext } from "@/lib/auth/household";
import { createRecurringPayment } from "./recurring-service";

function makeCtx(overrides?: Partial<HouseholdContext>): HouseholdContext {
  return {
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      email: "owner@example.com",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as HouseholdContext["user"],
    membershipId: "22222222-2222-2222-2222-222222222222",
    householdId: "33333333-3333-3333-3333-333333333333",
    role: "owner",
    displayName: "Owner",
    currency: "EUR",
    householdName: "Test Family",
    ...overrides,
  };
}

const CATEGORY_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const ACCOUNT_ID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const baseInput = {
  name: "Rent",
  type: "expense" as const,
  amount: "900.00",
  categoryId: CATEGORY_ID,
  accountId: ACCOUNT_ID,
  frequency: "monthly" as const,
  startDate: "2026-11-01",
  endDate: null,
  description: null,
};

function accountQuery(currency = "EUR") {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: ACCOUNT_ID,
              currency,
              is_active: true,
              household_id: "33333333-3333-3333-3333-333333333333",
            },
            error: null,
          }),
        }),
      }),
    }),
  };
}

function categoryQuery(type: string) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: {
            id: CATEGORY_ID,
            type,
            is_active: true,
            household_id: "33333333-3333-3333-3333-333333333333",
          },
          error: null,
        }),
      }),
    }),
  };
}

describe("recurring create validation", () => {
  it("rejects currency that does not match the account", async () => {
    const from = vi.fn((table: string) => {
      if (table === "accounts") return accountQuery("EUR");
      if (table === "categories") return categoryQuery("expense");
      return {};
    });

    const supabase = { from, rpc: vi.fn() } as never;
    const { error } = await createRecurringPayment(supabase, makeCtx(), {
      ...baseInput,
      currency: "USD",
    });
    expect(error?.code).toBe("VALIDATION");
    expect(error?.message).toMatch(/currency/i);
  });

  it("rejects category type mismatch for income template", async () => {
    const from = vi.fn((table: string) => {
      if (table === "accounts") return accountQuery("EUR");
      if (table === "categories") return categoryQuery("expense");
      return {};
    });

    const supabase = { from, rpc: vi.fn() } as never;
    const { error } = await createRecurringPayment(supabase, makeCtx(), {
      ...baseInput,
      type: "income",
    });
    expect(error?.code).toBe("VALIDATION");
    expect(error?.message).toMatch(/category type/i);
  });
});
