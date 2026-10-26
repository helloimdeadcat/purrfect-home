import { describe, expect, it, vi } from "vitest";

import type { HouseholdContext } from "@/lib/auth/household";
import {
  applyGoalOperation,
  createGoal,
  deleteGoal,
} from "./goal-service";

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

describe("goal access control", () => {
  it("forbids viewers from creating goals", async () => {
    const supabase = { from: vi.fn(), rpc: vi.fn() } as never;
    const { error } = await createGoal(supabase, makeCtx({ role: "viewer" }), {
      name: "Trip",
      targetAmount: "100.00",
      initialAmount: "0.00",
      description: null,
      targetDate: null,
    });
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("forbids viewers from applying operations", async () => {
    const supabase = { from: vi.fn(), rpc: vi.fn() } as never;
    const { error } = await applyGoalOperation(
      supabase,
      makeCtx({ role: "viewer" }),
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      { type: "deposit", amount: "10.00", note: null, operationDate: null },
    );
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("forbids members from deleting goals", async () => {
    const supabase = { from: vi.fn(), rpc: vi.fn() } as never;
    const { error } = await deleteGoal(
      supabase,
      makeCtx({ role: "member" }),
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    );
    expect(error?.code).toBe("FORBIDDEN");
  });
});
