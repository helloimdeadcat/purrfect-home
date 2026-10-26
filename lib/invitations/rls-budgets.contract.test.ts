import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("budgets RLS and uniqueness contract", () => {
  const init = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260930130000_init_family_finance_schema.sql",
    ),
    "utf8",
  );
  const monthly = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20261018140000_monthly_category_budgets.sql",
    ),
    "utf8",
  );

  it("scopes budgets to household members and write roles", () => {
    expect(init).toContain("budgets_select_member");
    expect(init).toContain("budgets_insert_member");
    expect(init).toContain("budgets_update_member");
    expect(init).toContain("budgets_delete_admin");
    expect(init).toMatch(
      /ON public\.budgets FOR SELECT[\s\S]*is_household_member\(household_id\)/,
    );
  });

  it("adds unique monthly category budget index", () => {
    expect(monthly).toContain("budgets_household_category_month_uidx");
    expect(monthly).toContain("period_type = 'monthly'");
  });
});
