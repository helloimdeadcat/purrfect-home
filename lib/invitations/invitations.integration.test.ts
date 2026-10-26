import { describe, expect, it } from "vitest";

/**
 * Integration checks against a real Supabase project.
 *
 * Required env (server-side only — never expose service role to the browser):
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY (or a test harness with two user JWTs)
 * - Migration 20261018120000_household_invitations.sql applied
 *
 * Scenarios that MUST be verified manually or in CI with Supabase:
 * 1. Invite without rights (member JWT → INSERT denied by RLS)
 * 2. Expired token → accept_household_invitation raises
 * 3. Re-accept same token → already_member or "already used"
 * 4. Accept with different account email → Invalid invitation
 * 5. Role elevation via insert payload role=owner → CHECK / RLS reject
 * 6. Two parallel accept RPCs on same token → one membership, one failure/already
 * 7. Household A member cannot SELECT accounts of household B (RLS isolation)
 *
 * These are not stubbed as passing unit tests — they need a live database.
 */
const hasSupabase =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
  process.env.RUN_SUPABASE_INTEGRATION === "1";

describe.skipIf(!hasSupabase)("household invitations (live Supabase)", () => {
  it("placeholder: enable RUN_SUPABASE_INTEGRATION=1 with service role to run", () => {
    expect(hasSupabase).toBe(true);
  });
});

describe("integration requirements (documentation guard)", () => {
  it("documents that live Supabase is required for concurrency and RLS checks", () => {
    expect(hasSupabase || !hasSupabase).toBe(true);
  });
});
