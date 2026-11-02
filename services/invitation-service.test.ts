import { describe, expect, it, vi } from "vitest";

import type { HouseholdContext } from "@/lib/auth/household";
import { createInvitation } from "./invitation-service";

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

function mockSupabase(handlers: {
  members?: unknown[];
  profiles?: unknown[];
  pendingRows?: { id: string; expires_at: string }[];
  insertError?: { code?: string; message: string } | null;
  insertData?: unknown;
  onExpire?: () => void;
}) {
  const from = vi.fn((table: string) => {
    if (table === "household_members") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({ data: handlers.members ?? [], error: null }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({ data: handlers.profiles ?? [], error: null }),
        }),
      };
    }
    if (table === "household_invitations") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              ilike: () =>
                Promise.resolve({
                  data: handlers.pendingRows ?? [],
                  error: null,
                }),
            }),
          }),
        }),
        update: () => ({
          in: () => ({
            eq: () => ({
              eq: async () => {
                handlers.onExpire?.();
                return { error: null };
              },
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: handlers.insertData ?? null,
                error: handlers.insertError ?? null,
              }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });

  return { from } as never;
}

describe("createInvitation authorization", () => {
  it("rejects invite without owner/admin rights", async () => {
    const supabase = mockSupabase({});
    const { data, error } = await createInvitation(
      supabase,
      makeCtx({ role: "member" }),
      { email: "partner@example.com", role: "member" },
      "http://localhost:3000",
    );
    expect(data).toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("rejects invalid self-invite", async () => {
    const supabase = mockSupabase({});
    const { error } = await createInvitation(
      supabase,
      makeCtx(),
      { email: "owner@example.com", role: "member" },
      "http://localhost:3000",
    );
    expect(error?.code).toBe("VALIDATION");
  });

  it("rejects duplicate pending invitation for the same email", async () => {
    const supabase = mockSupabase({
      pendingRows: [
        {
          id: "55555555-5555-5555-5555-555555555555",
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      ],
    });
    const { error } = await createInvitation(
      supabase,
      makeCtx(),
      { email: "partner@example.com", role: "member" },
      "http://localhost:3000",
    );
    expect(error?.code).toBe("CONFLICT");
    expect(error?.message).toMatch(/уже есть активное приглашение/i);
  });

  it("maps unique constraint violations to CONFLICT", async () => {
    const supabase = mockSupabase({
      insertError: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "household_invitations_pending_email_household_uidx"',
      },
    });
    const { error } = await createInvitation(
      supabase,
      makeCtx(),
      { email: "partner@example.com", role: "member" },
      "http://localhost:3000",
    );
    expect(error?.code).toBe("CONFLICT");
  });

  it("expires stale pending invites before creating a new one", async () => {
    let expired = false;
    const invitation = {
      id: "44444444-4444-4444-4444-444444444444",
      household_id: "33333333-3333-3333-3333-333333333333",
      email: "partner@example.com",
      role: "member" as const,
      token_hash: "abc",
      status: "pending" as const,
      invited_by: "11111111-1111-1111-1111-111111111111",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      accepted_at: null,
      accepted_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const supabase = mockSupabase({
      pendingRows: [
        {
          id: "66666666-6666-6666-6666-666666666666",
          expires_at: new Date(Date.now() - 1000).toISOString(),
        },
      ],
      insertData: invitation,
      onExpire: () => {
        expired = true;
      },
    });

    const { data, error } = await createInvitation(
      supabase,
      makeCtx(),
      { email: "partner@example.com", role: "member" },
      "http://localhost:3000",
    );

    expect(expired).toBe(true);
    expect(error).toBeNull();
    expect(data?.inviteUrl).toMatch(/\/invite\?token=/);
  });

  it("creates invitation and returns invite URL only to caller (not stored)", async () => {
    const invitation = {
      id: "44444444-4444-4444-4444-444444444444",
      household_id: "33333333-3333-3333-3333-333333333333",
      email: "partner@example.com",
      role: "member" as const,
      token_hash: "abc",
      status: "pending" as const,
      invited_by: "11111111-1111-1111-1111-111111111111",
      expires_at: new Date().toISOString(),
      accepted_at: null,
      accepted_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const supabase = mockSupabase({ insertData: invitation });
    const { data, error } = await createInvitation(
      supabase,
      makeCtx(),
      { email: "partner@example.com", role: "member" },
      "http://localhost:3000",
    );

    expect(error).toBeNull();
    expect(data?.invitation).not.toHaveProperty("token_hash");
    expect(data?.invitation.email).toBe("partner@example.com");
    expect(data?.inviteUrl).toMatch(
      /^http:\/\/localhost:3000\/invite\?token=/,
    );
    expect(data?.inviteUrl).not.toContain(invitation.token_hash);
    expect(data?.deliveryMode).toBe("dev_link");
  });
});
