import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract tests for the accept RPC. Full concurrency / expiry / wrong-email
 * behaviour requires a live Supabase Postgres (see invitations.integration.test.ts).
 */
describe("accept_household_invitation SQL contract", () => {
  const sql = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20261018120000_household_invitations.sql",
    ),
    "utf8",
  );

  it("stores only token_hash and hashes with sha256 digest", () => {
    expect(sql).toContain("token_hash text NOT NULL UNIQUE");
    expect(sql).toContain(
      "extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text)",
    );
    // No plaintext token column on the invitations table
    expect(sql).not.toMatch(/^\s*token text/m);
  });

  it("locks the invitation row for concurrent accept safety", () => {
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("Invitation already used");
  });

  it("rejects expired invitations and marks them expired", () => {
    expect(sql).toContain("Invitation expired");
    expect(sql).toContain("status = 'expired'");
  });

  it("matches invite email case-insensitively without leaking other accounts", () => {
    expect(sql).toContain("lower(trim(v_inv.email)) IS DISTINCT FROM lower(trim(v_email))");
    expect(sql).toContain("RAISE EXCEPTION 'Invalid invitation'");
  });

  it("forces member role on insert and check constraint", () => {
    expect(sql).toContain("CHECK (role IN ('member'))");
    expect(sql).toMatch(/VALUES\s*\(\s*v_inv\.household_id,\s*v_user_id,\s*'member'/);
  });

  it("does not take household_id from the client", () => {
    expect(sql).toContain("accept_household_invitation(p_token text)");
    expect(sql).not.toMatch(/accept_household_invitation\([^)]*household/i);
  });
});
