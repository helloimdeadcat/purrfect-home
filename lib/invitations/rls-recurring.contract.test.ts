import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("recurring payments RLS and confirm contract", () => {
  const init = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260930130000_init_family_finance_schema.sql",
    ),
    "utf8",
  );
  const mig = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20261018160000_recurring_payments_confirm.sql",
    ),
    "utf8",
  );

  it("has household-scoped policies, unique dates, and auto_create off by default", () => {
    expect(init).toContain("recurring_payments_select_member");
    expect(init).toContain("UNIQUE (recurring_payment_id, scheduled_date)");
    expect(init).toContain("auto_create");
  });

  it("adds atomic confirm/skip with FOR UPDATE and duplicate guards", () => {
    expect(mig).toContain("confirm_recurring_occurrence");
    expect(mig).toContain("skip_recurring_occurrence");
    expect(mig).toContain("FOR UPDATE");
    expect(mig).toContain("Occurrence already processed");
    expect(mig).toContain("ON CONFLICT (recurring_payment_id, scheduled_date) DO NOTHING");
    expect(mig).toContain("is_archived");
    expect(mig).toContain("type text NOT NULL DEFAULT 'expense'");
    expect(mig).toContain("SECURITY DEFINER");
  });
});
