import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("household data isolation RLS contract", () => {
  const init = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260930130000_init_family_finance_schema.sql",
    ),
    "utf8",
  );
  const invites = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20261018120000_household_invitations.sql",
    ),
    "utf8",
  );

  it("scopes accounts/transactions/transfers to household membership", () => {
    expect(init).toContain("accounts_select_member");
    expect(init).toContain("transactions_select_member");
    expect(init).toContain("transfers_select_member");
    expect(init).toMatch(
      /ON public\.accounts FOR SELECT[\s\S]*is_household_member\(household_id\)/,
    );
    expect(init).toMatch(
      /ON public\.transactions FOR SELECT[\s\S]*is_household_member\(household_id\)/,
    );
  });

  it("invitation RLS requires membership / admin and forces member role", () => {
    expect(invites).toContain("household_invitations_select_member");
    expect(invites).toContain("household_invitations_insert_admin");
    expect(invites).toContain("AND role = 'member'");
    expect(invites).toContain("invited_by = auth.uid()");
  });

  it("preserves last-owner protection in schema migrations", () => {
    const audit = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20261017150000_audit_security_integrity_fixes.sql",
      ),
      "utf8",
    );
    expect(audit).toContain("enforce_last_owner_protection");
    expect(audit).toContain("Cannot remove the last owner of a household");
    expect(init).toContain("household_members_delete_admin");
  });
});
