import { describe, expect, it } from "vitest";

import {
  acceptInvitationSchema,
  createInvitationSchema,
  updateHouseholdSchema,
} from "./family";

describe("family validations", () => {
  it("rejects invalid invitation email", () => {
    const result = createInvitationSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("normalizes email and defaults role to member", () => {
    const result = createInvitationSchema.safeParse({
      email: "  Partner@Example.COM ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("partner@example.com");
      expect(result.data.role).toBe("member");
    }
  });

  it("rejects attempts to invite as owner or admin", () => {
    for (const role of ["owner", "admin", "viewer"]) {
      const result = createInvitationSchema.safeParse({
        email: "partner@example.com",
        role,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects short accept tokens", () => {
    expect(acceptInvitationSchema.safeParse({ token: "short" }).success).toBe(
      false,
    );
  });

  it("requires household name", () => {
    expect(updateHouseholdSchema.safeParse({ name: "  " }).success).toBe(
      false,
    );
  });
});
