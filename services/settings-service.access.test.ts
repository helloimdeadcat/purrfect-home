import { describe, expect, it, vi } from "vitest";

import type { HouseholdContext } from "@/lib/auth/household";
import { updateHouseholdSettings } from "./settings-service";

function makeCtx(overrides?: Partial<HouseholdContext>): HouseholdContext {
  return {
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      email: "member@example.com",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as HouseholdContext["user"],
    membershipId: "22222222-2222-2222-2222-222222222222",
    householdId: "33333333-3333-3333-3333-333333333333",
    role: "member",
    displayName: "Member",
    currency: "EUR",
    householdName: "Test Family",
    ...overrides,
  };
}

describe("household settings access", () => {
  it("forbids members from updating household settings", async () => {
    const { error } = await updateHouseholdSettings(
      { from: vi.fn() } as never,
      makeCtx(),
      { timezone: "UTC" },
    );
    expect(error?.code).toBe("FORBIDDEN");
  });
});
