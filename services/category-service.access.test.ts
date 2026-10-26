import { describe, expect, it, vi } from "vitest";

import type { HouseholdContext } from "@/lib/auth/household";
import {
  archiveOrDeleteCategory,
  createCategory,
} from "./category-service";

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

describe("category access", () => {
  it("forbids viewers from creating categories", async () => {
    const { error } = await createCategory(
      { from: vi.fn() } as never,
      makeCtx({ role: "viewer" }),
      { name: "Food", type: "expense" },
    );
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("forbids members from deleting categories", async () => {
    const { error } = await archiveOrDeleteCategory(
      { from: vi.fn() } as never,
      makeCtx({ role: "member" }),
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    );
    expect(error?.code).toBe("FORBIDDEN");
  });
});
