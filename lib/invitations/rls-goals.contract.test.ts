import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("goals RLS and operations contract", () => {
  const init = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260930130000_init_family_finance_schema.sql",
    ),
    "utf8",
  );
  const goals = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20261018150000_goals_currency_archive_operations.sql",
    ),
    "utf8",
  );

  it("scopes goals to household membership", () => {
    expect(init).toContain("goals_select_member");
    expect(init).toContain("goals_insert_member");
    expect(init).toContain("goals_delete_admin");
  });

  it("adds operations table, archive/currency, and atomic RPC", () => {
    expect(goals).toContain("goal_operations");
    expect(goals).toContain("is_archived");
    expect(goals).toContain("currency");
    expect(goals).toContain("apply_goal_operation");
    expect(goals).toContain("FOR UPDATE");
    expect(goals).toContain("Insufficient goal balance");
  });
});
