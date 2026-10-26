import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("settings reference data migration contract", () => {
  const mig = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20261018180000_settings_reference_data.sql",
    ),
    "utf8",
  );

  it("adds tag archive flag and income_source link without dropping history", () => {
    expect(mig).toContain("ADD COLUMN IF NOT EXISTS is_active");
    expect(mig).toContain("income_source_id");
    expect(mig).toContain("ON DELETE SET NULL");
  });
});
