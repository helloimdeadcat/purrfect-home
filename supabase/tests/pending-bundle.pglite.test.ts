import { readFileSync } from "node:fs";
import path from "node:path";

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { createMigratedDb, migrationFiles } from "./pglite-db";

/** First migration that is not on the remote project yet. */
const BUNDLE_FROM = "20261018180000";
const bundlePath = path.join(process.cwd(), "supabase/pending/apply-pending-migrations.sql");

let db: PGlite;
let bundle: string;

beforeAll(async () => {
  bundle = readFileSync(bundlePath, "utf8");
  // Remote state: everything before the settings migration, with live data.
  db = await createMigratedDb({ before: BUNDLE_FROM });
  await db.exec(`
    INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-00000000000a', 'a@example.com');
    INSERT INTO public.profiles (id, email) VALUES ('00000000-0000-0000-0000-00000000000a', 'a@example.com');
    INSERT INTO public.households (id, name) VALUES ('10000000-0000-0000-0000-000000000001', 'H');
    INSERT INTO public.household_members (household_id, user_id, role)
      VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner');
    INSERT INTO public.accounts (id, household_id, name, type, currency)
      VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Main', 'bank_account', 'EUR');
    INSERT INTO public.categories (id, household_id, name, type)
      VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Rent', 'expense');
    INSERT INTO public.recurring_payments (household_id, name, type, amount, currency, category_id, account_id,
      frequency, day_of_month, start_date, next_due_date)
    VALUES ('10000000-0000-0000-0000-000000000001', 'Insurance', 'expense', 120, 'EUR',
      '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
      'yearly', NULL, '2024-02-29', '2027-02-28');
  `);
}, 60_000);

describe("pending migrations bundle", () => {
  it("contains exactly the migrations from the remote gap onward, in order", () => {
    const expected = migrationFiles().filter((f) => f.slice(0, 14) >= BUNDLE_FROM);
    const included = [...bundle.matchAll(/^-- {3}(\d{14}_\S+\.sql)$/gm)].map((m) => m[1]);
    expect(included).toEqual(expected);
  });

  it("applies on the remote-like schema and every verification row is ok", async () => {
    const results = await db.exec(bundle);
    const checklist = results.at(-1)!.rows as { check_name: string; ok: boolean }[];
    expect(checklist.length).toBeGreaterThan(20);
    expect(checklist.filter((row) => !row.ok)).toEqual([]);
  });

  it("is safe to run a second time", async () => {
    const results = await db.exec(bundle);
    const checklist = results.at(-1)!.rows as { ok: boolean }[];
    expect(checklist.every((row) => row.ok)).toBe(true);
  });

  it("backfilled the anchor day on existing yearly schedules", async () => {
    const { rows } = await db.query<{ day_of_month: number }>(
      "SELECT day_of_month FROM public.recurring_payments WHERE name = 'Insurance'",
    );
    expect(rows[0].day_of_month).toBe(29);
  });
});
