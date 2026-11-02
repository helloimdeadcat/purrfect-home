import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createMigratedDb } from "./pglite-db";

const OWNER = "00000000-0000-0000-0000-0000000000a1";
const PARTNER = "00000000-0000-0000-0000-0000000000a2";
const HOUSEHOLD = "10000000-0000-0000-0000-0000000000a1";
const ACCOUNT = "20000000-0000-0000-0000-0000000000a1";
const CATEGORY = "30000000-0000-0000-0000-0000000000a1";

// Transactions
const TX_LIVE_OLD = "40000000-0000-0000-0000-000000000001"; // real, 2 years old
const TX_DELETED_OLD = "40000000-0000-0000-0000-000000000002"; // deleted 120 days ago
const TX_DELETED_RECENT = "40000000-0000-0000-0000-000000000003"; // deleted 10 days ago
const TX_DELETED_WITH_RECEIPT = "40000000-0000-0000-0000-000000000004"; // deleted 120 days ago
const TX_LIVE_WITH_RECEIPT = "40000000-0000-0000-0000-000000000005";

// Notifications
const N_READ_OLD = "50000000-0000-0000-0000-000000000001"; // read, 61 days
const N_UNREAD_OLD = "50000000-0000-0000-0000-000000000002"; // unread, 61 days
const N_UNREAD_ANCIENT = "50000000-0000-0000-0000-000000000003"; // unread, 200 days
const N_READ_RECENT = "50000000-0000-0000-0000-000000000004"; // read, 5 days
const N_UNREAD_RECENT = "50000000-0000-0000-0000-000000000005"; // unread, today

// Audit
const AUDIT_OLD = "60000000-0000-0000-0000-000000000001"; // 400 days
const AUDIT_RECENT = "60000000-0000-0000-0000-000000000002"; // 300 days

// Invitations
const INV_REVOKED_OLD = "70000000-0000-0000-0000-000000000001";
const INV_PENDING_EXPIRED_OLD = "70000000-0000-0000-0000-000000000002";
const INV_REVOKED_RECENT = "70000000-0000-0000-0000-000000000003";
const INV_PENDING_VALID = "70000000-0000-0000-0000-000000000004";
const INV_ACCEPTED_OLD = "70000000-0000-0000-0000-000000000005";

const RECEIPT_ON_DELETED = `${HOUSEHOLD}/${TX_DELETED_WITH_RECEIPT}/a.jpg`;
const RECEIPT_ON_LIVE = `${HOUSEHOLD}/${TX_LIVE_WITH_RECEIPT}/b.jpg`;
const ORPHAN_OLD = `${HOUSEHOLD}/${TX_LIVE_OLD}/orphan-old.jpg`;
const ORPHAN_FRESH = `${HOUSEHOLD}/${TX_LIVE_OLD}/orphan-fresh.jpg`;

let db: PGlite;

async function exists(table: string, id: string): Promise<boolean> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public.${table} WHERE id = $1`,
    [id],
  );
  return rows[0].n === 1;
}

async function count(table: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public.${table}`,
  );
  return rows[0].n;
}

async function asServiceRole<T>(sql: string): Promise<T[]> {
  await db.exec("SET ROLE service_role;");
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("RESET ROLE;");
  }
}

beforeAll(async () => {
  db = await createMigratedDb();
  // Real Supabase storage.objects has created_at; the harness stub does not.
  await db.exec(`
    ALTER TABLE storage.objects ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

    INSERT INTO auth.users VALUES
      ('${OWNER}', 'owner@example.com'), ('${PARTNER}', 'partner@example.com');
    INSERT INTO public.profiles (id, email) VALUES
      ('${OWNER}', 'owner@example.com'), ('${PARTNER}', 'partner@example.com');
    INSERT INTO public.households (id, name) VALUES ('${HOUSEHOLD}', 'Family');
    INSERT INTO public.household_settings (household_id) VALUES ('${HOUSEHOLD}');
    INSERT INTO public.household_members (household_id, user_id, role) VALUES
      ('${HOUSEHOLD}', '${OWNER}', 'owner'), ('${HOUSEHOLD}', '${PARTNER}', 'member');
    INSERT INTO public.accounts (id, household_id, name, type, currency, initial_balance)
      VALUES ('${ACCOUNT}', '${HOUSEHOLD}', 'Main', 'bank_account', 'EUR', 1000);
    INSERT INTO public.categories (id, household_id, name, type)
      VALUES ('${CATEGORY}', '${HOUSEHOLD}', 'Food', 'expense');
    INSERT INTO public.goals (household_id, name, target_amount, current_amount, currency)
      VALUES ('${HOUSEHOLD}', 'Trip', 500, 100, 'EUR');

    INSERT INTO public.transactions
      (id, household_id, account_id, category_id, created_by, type, amount, currency,
       transaction_date, created_at, deleted_at)
    VALUES
      ('${TX_LIVE_OLD}', '${HOUSEHOLD}', '${ACCOUNT}', '${CATEGORY}', '${OWNER}', 'expense', 10, 'EUR',
       current_date - 730, now() - interval '730 days', NULL),
      ('${TX_DELETED_OLD}', '${HOUSEHOLD}', '${ACCOUNT}', '${CATEGORY}', '${OWNER}', 'expense', 20, 'EUR',
       current_date - 200, now() - interval '200 days', now() - interval '120 days'),
      ('${TX_DELETED_RECENT}', '${HOUSEHOLD}', '${ACCOUNT}', '${CATEGORY}', '${OWNER}', 'expense', 30, 'EUR',
       current_date - 20, now() - interval '20 days', now() - interval '10 days'),
      ('${TX_DELETED_WITH_RECEIPT}', '${HOUSEHOLD}', '${ACCOUNT}', '${CATEGORY}', '${OWNER}', 'expense', 40, 'EUR',
       current_date - 200, now() - interval '200 days', now() - interval '120 days'),
      ('${TX_LIVE_WITH_RECEIPT}', '${HOUSEHOLD}', '${ACCOUNT}', '${CATEGORY}', '${OWNER}', 'expense', 50, 'EUR',
       current_date - 400, now() - interval '400 days', NULL);

    INSERT INTO public.receipts
      (household_id, transaction_id, storage_path, file_name, mime_type, file_size, uploaded_by)
    VALUES
      ('${HOUSEHOLD}', '${TX_DELETED_WITH_RECEIPT}', '${RECEIPT_ON_DELETED}', 'a.jpg', 'image/jpeg', 1000, '${OWNER}'),
      ('${HOUSEHOLD}', '${TX_LIVE_WITH_RECEIPT}', '${RECEIPT_ON_LIVE}', 'b.jpg', 'image/jpeg', 2500, '${OWNER}');

    INSERT INTO storage.objects (bucket_id, name, created_at) VALUES
      ('receipts', '${RECEIPT_ON_DELETED}', now() - interval '200 days'),
      ('receipts', '${RECEIPT_ON_LIVE}', now() - interval '400 days'),
      ('receipts', '${ORPHAN_OLD}', now() - interval '2 days'),
      ('receipts', '${ORPHAN_FRESH}', now() - interval '5 minutes'),
      ('avatars', 'someone/else.png', now() - interval '30 days');

    INSERT INTO public.notifications (id, user_id, household_id, type, title, message, is_read, created_at)
    VALUES
      ('${N_READ_OLD}', '${OWNER}', '${HOUSEHOLD}', 't', 'x', 'x', true, now() - interval '61 days'),
      ('${N_UNREAD_OLD}', '${OWNER}', '${HOUSEHOLD}', 't', 'x', 'x', false, now() - interval '61 days'),
      ('${N_UNREAD_ANCIENT}', '${OWNER}', '${HOUSEHOLD}', 't', 'x', 'x', false, now() - interval '200 days'),
      ('${N_READ_RECENT}', '${OWNER}', '${HOUSEHOLD}', 't', 'x', 'x', true, now() - interval '5 days'),
      ('${N_UNREAD_RECENT}', '${OWNER}', '${HOUSEHOLD}', 't', 'x', 'x', false, now());

    INSERT INTO public.audit_logs (id, household_id, entity_type, entity_id, action, created_at)
    VALUES
      ('${AUDIT_OLD}', '${HOUSEHOLD}', 'account', '${ACCOUNT}', 'x', now() - interval '400 days'),
      ('${AUDIT_RECENT}', '${HOUSEHOLD}', 'account', '${ACCOUNT}', 'x', now() - interval '300 days');

    INSERT INTO public.household_invitations
      (id, household_id, email, token_hash, status, invited_by, expires_at,
       accepted_at, accepted_by, created_at, updated_at)
    VALUES
      ('${INV_REVOKED_OLD}', '${HOUSEHOLD}', 'a@example.com', 'h1', 'revoked', '${OWNER}',
       now() - interval '50 days', NULL, NULL, now() - interval '57 days', now() - interval '40 days'),
      ('${INV_PENDING_EXPIRED_OLD}', '${HOUSEHOLD}', 'b@example.com', 'h2', 'pending', '${OWNER}',
       now() - interval '40 days', NULL, NULL, now() - interval '47 days', now() - interval '47 days'),
      ('${INV_REVOKED_RECENT}', '${HOUSEHOLD}', 'c@example.com', 'h3', 'revoked', '${OWNER}',
       now() + interval '1 day', NULL, NULL, now() - interval '6 days', now() - interval '5 days'),
      ('${INV_PENDING_VALID}', '${HOUSEHOLD}', 'd@example.com', 'h4', 'pending', '${OWNER}',
       now() + interval '5 days', NULL, NULL, now() - interval '2 days', now() - interval '2 days'),
      ('${INV_ACCEPTED_OLD}', '${HOUSEHOLD}', 'partner@example.com', 'h5', 'accepted', '${OWNER}',
       now() - interval '300 days', now() - interval '305 days', '${PARTNER}',
       now() - interval '307 days', now() - interval '305 days');
  `);
}, 60_000);

describe("retention: access", () => {
  it("authenticated users cannot run the cleanup or list purgeable files", async () => {
    await expect(
      asUser(db, OWNER, "SELECT public.cleanup_expired_data()"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(db, OWNER, "SELECT * FROM public.list_purgeable_receipt_files(10)"),
    ).rejects.toThrow(/permission denied/i);
    await db.exec("SET ROLE anon;");
    try {
      await expect(db.query("SELECT public.cleanup_expired_data()")).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await db.exec("RESET ROLE;");
    }
  });

  it("members see their own household's receipt usage", async () => {
    const { rows } = await asUser<{ files: number; bytes: number }>(
      db,
      PARTNER,
      `SELECT files::int, bytes::int FROM public.household_receipt_usage('${HOUSEHOLD}')`,
    );
    expect(rows[0]).toEqual({ files: 2, bytes: 3500 });
  });
});

describe("retention: receipt files", () => {
  it("lists receipts of long-deleted transactions first, then old orphaned objects", async () => {
    const first = await asServiceRole<{ receipt_id: string | null; storage_path: string }>(
      "SELECT * FROM public.list_purgeable_receipt_files(100)",
    );
    expect(first).toHaveLength(1);
    expect(first[0].storage_path).toBe(RECEIPT_ON_DELETED);
    expect(first[0].receipt_id).not.toBeNull();

    // Simulate the cron: remove the file, then the row.
    await db.exec(`
      DELETE FROM storage.objects WHERE name = '${RECEIPT_ON_DELETED}';
      DELETE FROM public.receipts WHERE storage_path = '${RECEIPT_ON_DELETED}';
    `);

    const second = await asServiceRole<{ receipt_id: string | null; storage_path: string }>(
      "SELECT * FROM public.list_purgeable_receipt_files(100)",
    );
    // Fresh orphans (upload in flight), live receipts and other buckets stay.
    expect(second).toEqual([{ receipt_id: null, storage_path: ORPHAN_OLD }]);
  });
});

describe("retention: cleanup_expired_data", () => {
  it("deletes only expired rows and never real financial data", async () => {
    const before = {
      accounts: await count("accounts"),
      goals: await count("goals"),
      goalOperations: await count("goal_operations"),
      budgets: await count("budgets"),
      transfers: await count("transfers"),
      habitCheckins: await count("habit_checkins"),
      taskCompletions: await count("task_completions"),
    };

    const [{ result }] = await asServiceRole<{ result: Record<string, number> }>(
      "SELECT public.cleanup_expired_data() AS result",
    );
    expect(result).toEqual({
      notifications_read: 1,
      notifications_old: 1,
      audit_logs: 1,
      invitations: 2,
      deleted_transactions: 2,
    });

    // Notifications: unread recent and unread < 180 days survive.
    expect(await exists("notifications", N_READ_OLD)).toBe(false);
    expect(await exists("notifications", N_UNREAD_ANCIENT)).toBe(false);
    expect(await exists("notifications", N_UNREAD_OLD)).toBe(true);
    expect(await exists("notifications", N_READ_RECENT)).toBe(true);
    expect(await exists("notifications", N_UNREAD_RECENT)).toBe(true);

    expect(await exists("audit_logs", AUDIT_OLD)).toBe(false);
    expect(await exists("audit_logs", AUDIT_RECENT)).toBe(true);

    expect(await exists("household_invitations", INV_REVOKED_OLD)).toBe(false);
    expect(await exists("household_invitations", INV_PENDING_EXPIRED_OLD)).toBe(false);
    expect(await exists("household_invitations", INV_REVOKED_RECENT)).toBe(true);
    expect(await exists("household_invitations", INV_PENDING_VALID)).toBe(true);
    expect(await exists("household_invitations", INV_ACCEPTED_OLD)).toBe(true);

    // Live transactions are kept no matter how old; recently deleted ones too.
    expect(await exists("transactions", TX_LIVE_OLD)).toBe(true);
    expect(await exists("transactions", TX_LIVE_WITH_RECEIPT)).toBe(true);
    expect(await exists("transactions", TX_DELETED_RECENT)).toBe(true);
    expect(await exists("transactions", TX_DELETED_OLD)).toBe(false);
    // Its receipt was purged by the cron step above, so it may go now.
    expect(await exists("transactions", TX_DELETED_WITH_RECEIPT)).toBe(false);

    const { rows: receipts } = await db.query<{ storage_path: string }>(
      "SELECT storage_path FROM public.receipts",
    );
    expect(receipts).toEqual([{ storage_path: RECEIPT_ON_LIVE }]);

    expect({
      accounts: await count("accounts"),
      goals: await count("goals"),
      goalOperations: await count("goal_operations"),
      budgets: await count("budgets"),
      transfers: await count("transfers"),
      habitCheckins: await count("habit_checkins"),
      taskCompletions: await count("task_completions"),
    }).toEqual(before);
  });

  it("keeps a long-deleted transaction while it still has a receipt", async () => {
    const tx = "40000000-0000-0000-0000-000000000009";
    await db.exec(`
      INSERT INTO public.transactions
        (id, household_id, account_id, created_by, type, amount, currency, transaction_date, deleted_at)
      VALUES ('${tx}', '${HOUSEHOLD}', '${ACCOUNT}', '${OWNER}', 'expense', 5, 'EUR',
        current_date - 300, now() - interval '200 days');
      INSERT INTO public.receipts
        (household_id, transaction_id, storage_path, file_name, mime_type, file_size, uploaded_by)
      VALUES ('${HOUSEHOLD}', '${tx}', '${HOUSEHOLD}/${tx}/c.pdf', 'c.pdf', 'application/pdf', 10, '${OWNER}');
    `);

    const [{ result }] = await asServiceRole<{ result: Record<string, number> }>(
      "SELECT public.cleanup_expired_data() AS result",
    );
    expect(result.deleted_transactions).toBe(0);
    expect(await exists("transactions", tx)).toBe(true);
  });

  it("is idempotent", async () => {
    const [{ result }] = await asServiceRole<{ result: Record<string, number> }>(
      "SELECT public.cleanup_expired_data() AS result",
    );
    expect(Object.values(result).every((n) => n === 0)).toBe(true);
  });
});
