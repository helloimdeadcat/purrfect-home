import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import {
  asUser,
  createMigratedDb,
  expectBlocked,
  readMigration,
} from "./pglite-db";

const OWNER = "00000000-0000-0000-0000-00000000000a";
const MEMBER = "00000000-0000-0000-0000-00000000000b";
const HOUSEHOLD = "10000000-0000-0000-0000-000000000001";
const MIGRATION = "20261027120000_push_subscriptions.sql";

let db: PGlite;

async function asServiceRole<T = Record<string, unknown>>(sql: string) {
  await db.exec("SET ROLE service_role;");
  try {
    return await db.query<T>(sql);
  } finally {
    await db.exec("RESET ROLE;");
  }
}

function subscription(n: number) {
  return `'https://push.example.com/send/${n}', 'p256dh-${n}', 'auth-${n}', 'Test UA'`;
}

beforeAll(async () => {
  // Older notification created before the migration must be back-filled.
  db = await createMigratedDb({ before: "20261027120000" });
  await db.exec(`
    INSERT INTO auth.users VALUES
      ('${OWNER}', 'owner@example.com'),
      ('${MEMBER}', 'member@example.com');
    INSERT INTO public.profiles (id, email) VALUES
      ('${OWNER}', 'owner@example.com'),
      ('${MEMBER}', 'member@example.com');
    INSERT INTO public.households (id, name) VALUES ('${HOUSEHOLD}', 'Family');
    INSERT INTO public.household_settings (household_id) VALUES ('${HOUSEHOLD}');
    INSERT INTO public.household_members (household_id, user_id, role) VALUES
      ('${HOUSEHOLD}', '${OWNER}', 'owner'),
      ('${HOUSEHOLD}', '${MEMBER}', 'member');
    INSERT INTO public.notifications (user_id, household_id, type, title, message)
      VALUES ('${MEMBER}', '${HOUSEHOLD}', 'legacy', 'Old', 'Before push existed');
  `);
  await db.exec(readMigration(MIGRATION));
}, 60_000);

describe("push subscriptions migration", () => {
  it("is re-runnable and back-fills pushed_at on existing notifications", async () => {
    await expect(db.exec(readMigration(MIGRATION))).resolves.toBeDefined();
    const { rows } = await db.query<{ pushed: boolean }>(
      `SELECT pushed_at IS NOT NULL AND pushed_at = created_at AS pushed
       FROM public.notifications WHERE type = 'legacy'`,
    );
    expect(rows).toEqual([{ pushed: true }]);
  });
});

describe("push_subscriptions RLS", () => {
  it("users save and see only their own subscriptions", async () => {
    await asUser(db, OWNER, `SELECT public.save_push_subscription(${subscription(1)})`);
    await asUser(db, MEMBER, `SELECT public.save_push_subscription(${subscription(2)})`);

    const own = await asUser<{ user_id: string }>(
      db,
      OWNER,
      "SELECT user_id FROM public.push_subscriptions",
    );
    expect(own.rows).toEqual([{ user_id: OWNER }]);

    await expectBlocked(
      asUser(
        db,
        OWNER,
        `INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES ('${MEMBER}', 'https://push.example.com/forged', 'k', 'a')`,
      ),
    );
    await expectBlocked(
      asUser(
        db,
        OWNER,
        "DELETE FROM public.push_subscriptions WHERE endpoint = 'https://push.example.com/send/2'",
      ),
    );
    await expectBlocked(
      asUser(
        db,
        MEMBER,
        `UPDATE public.push_subscriptions SET p256dh = 'x'
         WHERE endpoint = 'https://push.example.com/send/2'`,
      ),
    );

    const removed = await asUser(
      db,
      MEMBER,
      "DELETE FROM public.push_subscriptions WHERE endpoint = 'https://push.example.com/send/2'",
    );
    expect(removed.affectedRows).toBe(1);
  });

  it("anonymous users cannot read subscriptions", async () => {
    await db.exec("SET ROLE anon;");
    try {
      await expect(db.query("SELECT * FROM public.push_subscriptions")).rejects.toThrow();
    } finally {
      await db.exec("RESET ROLE;");
    }
  });

  it("a shared device's endpoint moves to whoever subscribed last", async () => {
    await asUser(db, MEMBER, `SELECT public.save_push_subscription(${subscription(1)})`);
    const owner = await asUser(db, OWNER, "SELECT id FROM public.push_subscriptions");
    expect(owner.rows).toHaveLength(0);
    const member = await asUser(db, MEMBER, "SELECT id FROM public.push_subscriptions");
    expect(member.rows).toHaveLength(1);
  });

  it("keeps at most 5 devices per user, dropping the oldest", async () => {
    for (let n = 10; n < 17; n += 1) {
      await asUser(db, OWNER, `SELECT public.save_push_subscription(${subscription(n)})`);
    }
    const { rows } = await asUser<{ endpoint: string }>(
      db,
      OWNER,
      "SELECT endpoint FROM public.push_subscriptions ORDER BY endpoint",
    );
    expect(rows.map((row) => row.endpoint)).toEqual(
      [12, 13, 14, 15, 16].map((n) => `https://push.example.com/send/${n}`),
    );
  });
});

describe("notifications.pushed_at", () => {
  it("users cannot change pushed_at on their notifications", async () => {
    await expectBlocked(
      asUser(
        db,
        MEMBER,
        "UPDATE public.notifications SET pushed_at = NULL WHERE type = 'legacy'",
      ),
    );
  });

  it("claim_notification_pushes marks rows pushed once and skips stale ones", async () => {
    await db.exec(`
      INSERT INTO public.notifications (user_id, household_id, type, title, message, created_at)
      VALUES
        ('${MEMBER}', '${HOUSEHOLD}', 'fresh', 'Fresh', 'Now', now()),
        ('${OWNER}', '${HOUSEHOLD}', 'fresh', 'Fresh 2', 'Now', now()),
        ('${MEMBER}', '${HOUSEHOLD}', 'stale', 'Stale', 'Hours ago', now() - interval '3 hours');
    `);

    await expect(
      asUser(db, MEMBER, `SELECT * FROM public.claim_notification_pushes('${HOUSEHOLD}')`),
    ).rejects.toThrow();

    const first = await asServiceRole<{ type: string; user_id: string }>(
      `SELECT * FROM public.claim_notification_pushes('${HOUSEHOLD}', 20)`,
    );
    expect(first.rows.map((row) => row.type).sort()).toEqual(["fresh", "fresh"]);

    const second = await asServiceRole(
      `SELECT * FROM public.claim_notification_pushes('${HOUSEHOLD}', 20)`,
    );
    expect(second.rows).toHaveLength(0);

    const { rows } = await db.query<{ pending: number }>(
      "SELECT count(*)::int AS pending FROM public.notifications WHERE pushed_at IS NULL",
    );
    expect(rows[0].pending).toBe(0);
  });

  it("respects the per-call limit", async () => {
    await db.exec(`
      INSERT INTO public.notifications (user_id, household_id, type, title, message)
      SELECT '${MEMBER}', '${HOUSEHOLD}', 'bulk', 'Bulk ' || g, 'x'
      FROM generate_series(1, 5) AS g;
    `);
    const batch = await asServiceRole(
      `SELECT * FROM public.claim_notification_pushes('${HOUSEHOLD}', 3)`,
    );
    expect(batch.rows).toHaveLength(3);
    const rest = await asServiceRole(
      `SELECT * FROM public.claim_notification_pushes('${HOUSEHOLD}', 3)`,
    );
    expect(rest.rows).toHaveLength(2);
  });
});
