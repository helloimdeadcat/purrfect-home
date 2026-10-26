import { describe, expect, it, vi } from "vitest";

import type { HouseholdContext } from "@/lib/auth/household";
import {
  createMonthlyCategoryBudget,
  deleteBudget,
} from "./budget-service";

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

describe("budget access control", () => {
  it("forbids viewers from creating budgets", async () => {
    const supabase = { from: vi.fn() } as never;
    const { error } = await createMonthlyCategoryBudget(
      supabase,
      makeCtx({ role: "viewer" }),
      {
        categoryId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        amount: "100.00",
        month: "2026-10",
      },
    );
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("forbids viewers from deleting budgets", async () => {
    const supabase = { from: vi.fn() } as never;
    const { error } = await deleteBudget(
      supabase,
      makeCtx({ role: "viewer" }),
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    );
    expect(error?.code).toBe("FORBIDDEN");
  });
});
