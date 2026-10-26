import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("registration security policy", () => {
  it("does not use Admin createUser / email_confirm in register route", () => {
    const file = readFileSync(
      path.join(process.cwd(), "app/api/auth/register/route.ts"),
      "utf8",
    );
    expect(file).toContain("signUp");
    expect(file).not.toContain("createUser");
    expect(file).not.toContain("email_confirm");
    expect(file).not.toContain("createAdminClient");
  });

  it("does not re-export admin client from supabase barrel", () => {
    const file = readFileSync(
      path.join(process.cwd(), "lib/supabase/index.ts"),
      "utf8",
    );
    expect(file).not.toMatch(/export\s*\{[^}]*createAdminClient/);
  });
});
