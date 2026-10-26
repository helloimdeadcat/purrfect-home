import { describe, expect, it, vi } from "vitest";

import type { HouseholdContext } from "@/lib/auth/household";
import {
  confirmOccurrence,
  createRecurringPayment,
  deleteRecurringPayment,
} from "./recurring-service";

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

describe("recurring access control", () => {
  it("forbids viewers from creating templates", async () => {
    const supabase = { from: vi.fn(), rpc: vi.fn() } as never;
    const { error } = await createRecurringPayment(
      supabase,
      makeCtx({ role: "viewer" }),
      {
        name: "Rent",
        type: "expense",
        amount: "100.00",
        categoryId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        accountId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        frequency: "monthly",
        startDate: "2026-11-01",
        endDate: null,
        description: null,
      },
    );
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("forbids viewers from confirming", async () => {
    const supabase = { from: vi.fn(), rpc: vi.fn() } as never;
    const { error } = await confirmOccurrence(
      supabase,
      makeCtx({ role: "viewer" }),
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    );
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("forbids members from deleting templates", async () => {
    const supabase = { from: vi.fn(), rpc: vi.fn() } as never;
    const { error } = await deleteRecurringPayment(
      supabase,
      makeCtx({ role: "member" }),
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    );
    expect(error?.code).toBe("FORBIDDEN");
  });
});
