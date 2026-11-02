import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createMigratedDb, expectBlocked } from "./pglite-db";

const ALICE = "a1111111-1111-4111-8111-111111111111";
const BOB = "b2222222-2222-4222-8222-222222222222";

let db: PGlite;

beforeAll(async () => {
  db = await createMigratedDb();
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'a@x.test'), ($2, 'b@x.test')", [ALICE, BOB]);
}, 60_000);

const take = (user: string, windowLimit = 3, dailyLimit = 5) =>
  asUser<{ ok: boolean }>(db, user, "SELECT public.take_ai_quota('assistant', 600, $1, $2) AS ok", [windowLimit, dailyLimit]).then(
    (r) => r.rows[0].ok,
  );

describe("take_ai_quota", () => {
  it("allows requests up to the window limit, per user", async () => {
    expect([await take(ALICE), await take(ALICE), await take(ALICE)]).toEqual([true, true, true]);
    expect(await take(ALICE)).toBe(false);
    expect(await take(BOB)).toBe(true);
  });

  it("enforces the daily limit even when the window is free", async () => {
    await db.query("UPDATE public.ai_usage SET created_at = now() - interval '1 hour' WHERE user_id = $1", [ALICE]);
    expect([await take(ALICE), await take(ALICE)]).toEqual([true, true]);
    expect(await take(ALICE)).toBe(false); // 5 today
  });

  it("prunes rows older than two days", async () => {
    await db.query("UPDATE public.ai_usage SET created_at = now() - interval '3 days' WHERE user_id = $1", [BOB]);
    await take(BOB);
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.ai_usage WHERE user_id = $1", [BOB]);
    expect(rows[0].n).toBe(1);
  });

  it("hides the usage table from end users and rejects unknown kinds", async () => {
    await expectBlocked(asUser(db, ALICE, "SELECT * FROM public.ai_usage"));
    await expectBlocked(asUser(db, ALICE, "SELECT public.take_ai_quota('other', 600, 3, 5)"));
  });
});
