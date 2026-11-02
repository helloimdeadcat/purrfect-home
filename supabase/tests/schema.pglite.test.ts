import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import {
  asUser,
  createMigratedDb,
  expectBlocked,
  migrationFiles,
  readMigration,
} from "./pglite-db";

const OWNER = "00000000-0000-0000-0000-00000000000a";
const MEMBER = "00000000-0000-0000-0000-00000000000b";
const OUTSIDER = "00000000-0000-0000-0000-00000000000c";
const HOUSEHOLD = "10000000-0000-0000-0000-000000000001";
const OTHER_HOUSEHOLD = "10000000-0000-0000-0000-000000000002";
const ACCOUNT = "20000000-0000-0000-0000-000000000001";
const OTHER_ACCOUNT = "20000000-0000-0000-0000-000000000002";
const CATEGORY = "30000000-0000-0000-0000-000000000001";

let db: PGlite;

async function scalar<T>(sql: string): Promise<T> {
  const { rows } = await db.query<Record<string, T>>(sql);
  return Object.values(rows[0] ?? {})[0] as T;
}

beforeAll(async () => {
  db = await createMigratedDb();
  await db.exec(`
    INSERT INTO auth.users VALUES
      ('${OWNER}', 'owner@example.com'),
      ('${MEMBER}', 'member@example.com'),
      ('${OUTSIDER}', 'outsider@example.com');
    INSERT INTO public.profiles (id, email) VALUES
      ('${OWNER}', 'owner@example.com'),
      ('${MEMBER}', 'member@example.com'),
      ('${OUTSIDER}', 'outsider@example.com');
    INSERT INTO public.households (id, name) VALUES
      ('${HOUSEHOLD}', 'Family'), ('${OTHER_HOUSEHOLD}', 'Other');
    INSERT INTO public.household_settings (household_id) VALUES
      ('${HOUSEHOLD}'), ('${OTHER_HOUSEHOLD}');
    INSERT INTO public.household_members (household_id, user_id, role) VALUES
      ('${HOUSEHOLD}', '${OWNER}', 'owner'),
      ('${HOUSEHOLD}', '${MEMBER}', 'member'),
      ('${OTHER_HOUSEHOLD}', '${OUTSIDER}', 'owner');
    INSERT INTO public.accounts (id, household_id, name, type, currency, initial_balance) VALUES
      ('${ACCOUNT}', '${HOUSEHOLD}', 'Main', 'bank_account', 'EUR', 1000),
      ('${OTHER_ACCOUNT}', '${OTHER_HOUSEHOLD}', 'Cash', 'cash', 'EUR', 0);
    INSERT INTO public.categories (id, household_id, name, type)
      VALUES ('${CATEGORY}', '${HOUSEHOLD}', 'Rent', 'expense');
  `);
}, 60_000);

describe("migrations", () => {
  it("apply cleanly in order and the newest one is re-runnable", async () => {
    const newest = migrationFiles().at(-1)!;
    await expect(db.exec(readMigration(newest))).resolves.toBeDefined();
  });
});

describe("household membership", () => {
  it("owner cannot insert an arbitrary user into the household", async () => {
    await expectBlocked(
      asUser(
        db,
        OWNER,
        `INSERT INTO public.household_members (household_id, user_id, role)
         VALUES ('${HOUSEHOLD}', '${OUTSIDER}', 'member')`,
      ),
    );
  });

  it("member can change own display name but cannot self-promote", async () => {
    const renamed = await asUser(
      db,
      MEMBER,
      `UPDATE public.household_members SET display_name = 'Em'
       WHERE household_id = '${HOUSEHOLD}' AND user_id = '${MEMBER}'`,
    );
    expect(renamed.affectedRows).toBe(1);

    await expectBlocked(
      asUser(
        db,
        MEMBER,
        `UPDATE public.household_members SET role = 'owner'
         WHERE household_id = '${HOUSEHOLD}' AND user_id = '${MEMBER}'`,
      ),
    );
  });

  it("member rows cannot be moved to another household", async () => {
    await expectBlocked(
      asUser(
        db,
        OWNER,
        `UPDATE public.household_members SET household_id = '${OTHER_HOUSEHOLD}'
         WHERE household_id = '${HOUSEHOLD}' AND user_id = '${MEMBER}'`,
      ),
    );
  });

  it("owner can change roles, but never demote the last owner", async () => {
    await asUser(
      db,
      OWNER,
      `UPDATE public.household_members SET role = 'viewer'
       WHERE household_id = '${HOUSEHOLD}' AND user_id = '${MEMBER}'`,
    );
    await asUser(
      db,
      OWNER,
      `UPDATE public.household_members SET role = 'member'
       WHERE household_id = '${HOUSEHOLD}' AND user_id = '${MEMBER}'`,
    );
    await expectBlocked(
      asUser(
        db,
        OWNER,
        `UPDATE public.household_members SET role = 'member'
         WHERE household_id = '${HOUSEHOLD}' AND user_id = '${OWNER}'`,
      ),
    );
  });

  it("outsiders see no rows of another household", async () => {
    const { rows } = await asUser<{ n: number }>(
      db,
      OUTSIDER,
      `SELECT count(*)::int AS n FROM public.accounts WHERE household_id = '${HOUSEHOLD}'`,
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("goal history", () => {
  it("records the starting balance and blocks forged history or balances", async () => {
    const { rows } = await asUser<{ id: string }>(
      db,
      MEMBER,
      `INSERT INTO public.goals (household_id, name, target_amount, current_amount, currency)
       VALUES ('${HOUSEHOLD}', 'Trip', 500, 100, 'EUR') RETURNING id`,
    );
    const goalId = rows[0].id;

    expect(
      await scalar<string>(
        `SELECT string_agg(type, ',') FROM public.goal_operations WHERE goal_id = '${goalId}'`,
      ),
    ).toBe("initial");

    await expectBlocked(
      asUser(db, MEMBER, `UPDATE public.goals SET current_amount = 9999 WHERE id = '${goalId}'`),
    );
    await expectBlocked(
      asUser(
        db,
        MEMBER,
        `INSERT INTO public.goal_operations (goal_id, household_id, type, amount, balance_after, created_by)
         VALUES ('${goalId}', '${HOUSEHOLD}', 'deposit', 1, 9999, '${MEMBER}')`,
      ),
    );

    await asUser(
      db,
      MEMBER,
      `SELECT * FROM public.apply_goal_operation('${goalId}', 'deposit', 50)`,
    );
    expect(
      await scalar<string>(`SELECT current_amount FROM public.goals WHERE id = '${goalId}'`),
    ).toBe("150.00");
  });
});

describe("profiles", () => {
  it("email follows auth.users and cannot be set to someone else's", async () => {
    await asUser(
      db,
      MEMBER,
      `UPDATE public.profiles SET email = 'owner@example.com', first_name = 'M'
       WHERE id = '${MEMBER}'`,
    );
    const { rows } = await db.query<{ email: string; first_name: string }>(
      `SELECT email, first_name FROM public.profiles WHERE id = '${MEMBER}'`,
    );
    expect(rows[0]).toEqual({ email: "member@example.com", first_name: "M" });
  });
});

describe("transactions", () => {
  it("must use the account's currency", async () => {
    await expectBlocked(
      asUser(
        db,
        MEMBER,
        `INSERT INTO public.transactions (household_id, account_id, created_by, type, amount, currency, transaction_date)
         VALUES ('${HOUSEHOLD}', '${ACCOUNT}', '${MEMBER}', 'expense', 10, 'USD', '2026-10-20')`,
      ),
    );
    const ok = await asUser(
      db,
      MEMBER,
      `INSERT INTO public.transactions (household_id, account_id, created_by, type, amount, currency, transaction_date)
       VALUES ('${HOUSEHOLD}', '${ACCOUNT}', '${MEMBER}', 'expense', 10, 'EUR', '2026-10-20')`,
    );
    expect(ok.affectedRows).toBe(1);
  });

  it("cannot reference another household's income source", async () => {
    const memberId = await scalar<string>(
      `SELECT id FROM public.household_members WHERE user_id = '${OUTSIDER}'`,
    );
    const sourceId = await scalar<string>(
      `INSERT INTO public.income_sources (household_id, member_id, name, amount, frequency, next_date, account_id)
       VALUES ('${OTHER_HOUSEHOLD}', '${memberId}', 'Salary', 1, 'monthly', '2026-11-01', '${OTHER_ACCOUNT}')
       RETURNING id`,
    );
    await expectBlocked(
      asUser(
        db,
        MEMBER,
        `INSERT INTO public.transactions (household_id, account_id, created_by, type, amount, currency, transaction_date, income_source_id)
         VALUES ('${HOUSEHOLD}', '${ACCOUNT}', '${MEMBER}', 'income', 10, 'EUR', '2026-10-20', '${sourceId}')`,
      ),
    );
  });
});

describe("recurring payments", () => {
  it.each([
    ["2028-02-29", "yearly", 29, "2029-02-28"],
    ["2029-02-28", "yearly", 29, "2030-02-28"],
    ["2031-02-28", "yearly", 29, "2032-02-29"],
    ["2026-10-18", "yearly", 18, "2027-10-18"],
    ["2026-01-31", "monthly", 31, "2026-02-28"],
    ["2026-02-28", "monthly", 31, "2026-03-31"],
  ])("SQL next due date from %s (%s, day %i) is %s", async (from, frequency, dom, expected) => {
    expect(
      await scalar<string>(
        `SELECT public.compute_next_recurring_due_date('${from}', '${frequency}', NULL, ${dom}, NULL)::text`,
      ),
    ).toBe(expected);
  });

  it("confirm RPC creates a transaction in the account currency", async () => {
    await db.exec(`
      INSERT INTO public.recurring_payments (id, household_id, name, type, amount, currency, category_id, account_id,
        frequency, day_of_month, start_date, next_due_date)
      VALUES ('40000000-0000-0000-0000-000000000001', '${HOUSEHOLD}', 'Rent', 'expense', 700, 'EUR',
        '${CATEGORY}', '${ACCOUNT}', 'monthly', 1, '2026-10-01', '2026-10-01');
      INSERT INTO public.recurring_payment_occurrences (id, recurring_payment_id, household_id, scheduled_date, status)
      VALUES ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
        '${HOUSEHOLD}', '2026-10-01', 'pending');
    `);
    const { rows } = await asUser<{ transaction_id: string }>(
      db,
      MEMBER,
      `SELECT * FROM public.confirm_recurring_occurrence('50000000-0000-0000-0000-000000000001')`,
    );
    expect(rows[0].transaction_id).toBeTruthy();
    expect(
      await scalar<string>(
        `SELECT currency FROM public.transactions WHERE id = '${rows[0].transaction_id}'`,
      ),
    ).toBe("EUR");
  });
});

describe("receipt storage", () => {
  it("members cannot overwrite objects; owners can", async () => {
    const objectPath = `${HOUSEHOLD}/tx/receipt.pdf`;
    await db.exec(`
      INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false)
        ON CONFLICT DO NOTHING;
      INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('receipts', '${objectPath}', '${OWNER}');
    `);
    await expectBlocked(
      asUser(db, MEMBER, `UPDATE storage.objects SET owner = '${MEMBER}' WHERE name = '${objectPath}'`),
    );
    const byOwner = await asUser(
      db,
      OWNER,
      `UPDATE storage.objects SET owner = '${OWNER}' WHERE name = '${objectPath}'`,
    );
    expect(byOwner.affectedRows).toBe(1);
  });
});

describe("receipts", () => {
  let txId: string;

  beforeAll(async () => {
    txId = await scalar<string>(
      `INSERT INTO public.transactions (household_id, account_id, created_by, type, amount, currency, transaction_date)
       VALUES ('${HOUSEHOLD}', '${ACCOUNT}', '${MEMBER}', 'expense', 42, 'EUR', '2026-10-21') RETURNING id`,
    );
  });

  it("rows must point at the household's own transaction and folder", async () => {
    const foreignTx = await scalar<string>(
      `INSERT INTO public.transactions (household_id, account_id, created_by, type, amount, currency, transaction_date)
       VALUES ('${OTHER_HOUSEHOLD}', '${OTHER_ACCOUNT}', '${OUTSIDER}', 'expense', 1, 'EUR', '2026-10-21') RETURNING id`,
    );
    await expectBlocked(
      asUser(
        db,
        MEMBER,
        `INSERT INTO public.receipts (household_id, transaction_id, storage_path, file_name, mime_type, file_size, uploaded_by)
         VALUES ('${HOUSEHOLD}', '${foreignTx}', '${HOUSEHOLD}/${foreignTx}/x.pdf', 'x.pdf', 'application/pdf', 1, '${MEMBER}')`,
      ),
    );
    await expectBlocked(
      asUser(
        db,
        MEMBER,
        `INSERT INTO public.receipts (household_id, transaction_id, storage_path, file_name, mime_type, file_size, uploaded_by)
         VALUES ('${HOUSEHOLD}', '${txId}', '${OTHER_HOUSEHOLD}/${txId}/x.pdf', 'x.pdf', 'application/pdf', 1, '${MEMBER}')`,
      ),
    );
  });

  it("uploader can delete own receipt file and row; another member cannot", async () => {
    const path = `${HOUSEHOLD}/${txId}/mine.pdf`;
    await db.exec(`INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false)
                   ON CONFLICT DO NOTHING;
                   INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('receipts', '${path}', '${MEMBER}');`);
    await asUser(
      db,
      MEMBER,
      `INSERT INTO public.receipts (household_id, transaction_id, storage_path, file_name, mime_type, file_size, uploaded_by)
       VALUES ('${HOUSEHOLD}', '${txId}', '${path}', 'mine.pdf', 'application/pdf', 10, '${MEMBER}')`,
    );

    // A second member who did not upload it
    const SECOND = "00000000-0000-0000-0000-00000000000d";
    await db.exec(`INSERT INTO auth.users VALUES ('${SECOND}', 'second@example.com');
                   INSERT INTO public.household_members (household_id, user_id, role)
                   VALUES ('${HOUSEHOLD}', '${SECOND}', 'member');`);
    await expectBlocked(
      asUser(db, SECOND, `DELETE FROM storage.objects WHERE name = '${path}'`),
    );
    await expectBlocked(
      asUser(db, SECOND, `DELETE FROM public.receipts WHERE storage_path = '${path}'`),
    );

    const file = await asUser(db, MEMBER, `DELETE FROM storage.objects WHERE name = '${path}'`);
    expect(file.affectedRows).toBe(1);
    const row = await asUser(db, MEMBER, `DELETE FROM public.receipts WHERE storage_path = '${path}'`);
    expect(row.affectedRows).toBe(1);
  });
});

describe("notifications and audit log", () => {
  it("confirming a recurring payment notifies the other members, not the actor", async () => {
    // Confirmed by MEMBER in the "recurring payments" block above.
    const forOwner = await scalar<number>(
      `SELECT count(*)::int FROM public.notifications
       WHERE user_id = '${OWNER}' AND type = 'recurring_paid'`,
    );
    const forActor = await scalar<number>(
      `SELECT count(*)::int FROM public.notifications
       WHERE user_id = '${MEMBER}' AND type = 'recurring_paid'`,
    );
    expect(forOwner).toBe(1);
    expect(forActor).toBe(0);
    expect(
      await scalar<string>(
        `SELECT message FROM public.notifications WHERE user_id = '${OWNER}' AND type = 'recurring_paid'`,
      ),
    ).toMatch(/оплачено «Rent» \(700\.00 EUR, срок 2026-10-01\)/);
  });

  it("users read only their own notifications and may only toggle is_read", async () => {
    const { rows } = await asUser<{ n: number }>(
      db,
      MEMBER,
      `SELECT count(*)::int AS n FROM public.notifications WHERE user_id = '${OWNER}'`,
    );
    expect(rows[0].n).toBe(0);

    const read = await asUser(
      db,
      OWNER,
      `UPDATE public.notifications SET is_read = true WHERE user_id = '${OWNER}'`,
    );
    expect(read.affectedRows).toBeGreaterThan(0);
    await expectBlocked(
      asUser(db, OWNER, `UPDATE public.notifications SET message = 'forged' WHERE user_id = '${OWNER}'`),
    );
    await expectBlocked(
      asUser(
        db,
        OWNER,
        `INSERT INTO public.notifications (user_id, household_id, type, title, message)
         VALUES ('${MEMBER}', '${HOUSEHOLD}', 'x', 'x', 'spoof')`,
      ),
    );
  });

  it("audit log is written by triggers, readable by owners only, never by clients", async () => {
    const actions = await scalar<string>(
      `SELECT string_agg(DISTINCT action, ',' ORDER BY action) FROM public.audit_logs
       WHERE household_id = '${HOUSEHOLD}'`,
    );
    expect(actions).toContain("recurring_paid");
    expect(actions).toContain("member_role_changed");

    const ownerView = await asUser<{ n: number }>(
      db,
      OWNER,
      `SELECT count(*)::int AS n FROM public.audit_logs WHERE household_id = '${HOUSEHOLD}'`,
    );
    expect(ownerView.rows[0].n).toBeGreaterThan(0);
    const memberView = await asUser<{ n: number }>(
      db,
      MEMBER,
      `SELECT count(*)::int AS n FROM public.audit_logs WHERE household_id = '${HOUSEHOLD}'`,
    );
    expect(memberView.rows[0].n).toBe(0);

    await expectBlocked(
      asUser(
        db,
        OWNER,
        `INSERT INTO public.audit_logs (household_id, user_id, entity_type, entity_id, action)
         VALUES ('${HOUSEHOLD}', '${OWNER}', 'x', '${HOUSEHOLD}', 'forged')`,
      ),
    );
    await expectBlocked(
      asUser(db, OWNER, `DELETE FROM public.audit_logs WHERE household_id = '${HOUSEHOLD}'`),
    );
  });

  it("invitation audit entries never contain the token hash", async () => {
    await db.exec(`INSERT INTO public.household_invitations (household_id, email, role, token_hash, invited_by, expires_at)
                   VALUES ('${HOUSEHOLD}', 'new@example.com', 'member', 'secret-hash-value', '${OWNER}', now() + interval '7 days')`);
    const payload = await scalar<string>(
      `SELECT new_data::text FROM public.audit_logs WHERE action = 'invitation_created'`,
    );
    expect(payload).toContain("new@example.com");
    expect(payload).not.toContain("secret-hash-value");
  });
});

describe("safe-to-spend settings", () => {
  it("accepts a valid per-currency reserve map and rejects malformed ones", async () => {
    const ok = await asUser(
      db,
      OWNER,
      `UPDATE public.household_settings SET safe_to_spend_reserves = '{"EUR":"500.00","USD":"0"}'
       WHERE household_id = '${HOUSEHOLD}'`,
    );
    expect(ok.affectedRows).toBe(1);
    for (const bad of [`'{"eur":"1.00"}'`, `'{"EUR":"-5.00"}'`, `'{"EUR":"1.234"}'`, `'{"EUR":5}'`, `'[]'`]) {
      await expectBlocked(
        asUser(
          db,
          OWNER,
          `UPDATE public.household_settings SET safe_to_spend_reserves = ${bad}::jsonb
           WHERE household_id = '${HOUSEHOLD}'`,
        ),
      );
    }
    expect(
      await scalar<string>(
        `SELECT new_data->'safe_to_spend_reserves'->>'EUR' FROM public.audit_logs
         WHERE action = 'settings_updated' ORDER BY created_at DESC LIMIT 1`,
      ),
    ).toBe("500.00");
  });

  it("recurring payments are mandatory unless marked otherwise", async () => {
    expect(
      await scalar<boolean>(
        `SELECT bool_and(is_mandatory) FROM public.recurring_payments WHERE household_id = '${HOUSEHOLD}'`,
      ),
    ).toBe(true);
  });
});

describe("tasks and schedule", () => {
  let ownerMemberId: string;

  beforeAll(async () => {
    ownerMemberId = await scalar<string>(
      `SELECT id FROM public.household_members WHERE household_id = '${HOUSEHOLD}' AND user_id = '${OWNER}'`,
    );
  });

  it("a member can assign a repeating chore to the partner, who gets notified", async () => {
    const { rows } = await asUser<{ id: string }>(
      db,
      MEMBER,
      `INSERT INTO public.tasks (household_id, title, assignee_member_id, start_date, repeat_kind, repeat_weekdays)
       VALUES ('${HOUSEHOLD}', 'Vacuum', '${ownerMemberId}', '2026-10-26', 'weekly', '{6}') RETURNING id`,
    );
    expect(rows[0].id).toBeTruthy();
    expect(
      await scalar<string>(
        `SELECT message FROM public.notifications WHERE user_id = '${OWNER}' AND type = 'task_assigned'`,
      ),
    ).toMatch(/добавляет тебе: Vacuum/);
  });

  it("rejects malformed repeats and events without time", async () => {
    for (const bad of [
      `'Weekly without days', NULL, '2026-10-26', 'weekly', NULL, 'task', NULL`,
      `'Repeat without start', NULL, NULL, 'daily', NULL, 'task', NULL`,
      `'Event without time', NULL, '2026-10-26', 'none', NULL, 'event', NULL`,
      `'Bad weekday', NULL, '2026-10-26', 'weekly', '{8}', 'task', NULL`,
    ]) {
      await expectBlocked(
        asUser(
          db,
          MEMBER,
          `INSERT INTO public.tasks (household_id, title, assignee_member_id, start_date, repeat_kind, repeat_weekdays, kind, start_time)
           VALUES ('${HOUSEHOLD}', ${bad})`,
        ),
      );
    }
  });

  it("cannot assign to someone from another household; outsiders see nothing", async () => {
    const foreignMember = await scalar<string>(
      `SELECT id FROM public.household_members WHERE user_id = '${OUTSIDER}'`,
    );
    await expectBlocked(
      asUser(
        db,
        MEMBER,
        `INSERT INTO public.tasks (household_id, title, assignee_member_id) VALUES ('${HOUSEHOLD}', 'X', '${foreignMember}')`,
      ),
    );
    const { rows } = await asUser<{ n: number }>(
      db,
      OUTSIDER,
      `SELECT count(*)::int AS n FROM public.tasks WHERE household_id = '${HOUSEHOLD}'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it("occurrences are ticked off once per date; members delete only their own tasks", async () => {
    const taskId = await scalar<string>(`SELECT id FROM public.tasks WHERE title = 'Vacuum'`);
    await asUser(
      db,
      OWNER,
      `INSERT INTO public.task_completions (task_id, household_id, occurrence_date)
       VALUES ('${taskId}', '${HOUSEHOLD}', '2026-10-31')`,
    );
    await expectBlocked(
      asUser(
        db,
        OWNER,
        `INSERT INTO public.task_completions (task_id, household_id, occurrence_date)
         VALUES ('${taskId}', '${HOUSEHOLD}', '2026-10-31')`,
      ),
    );
    const ownerTask = await scalar<string>(
      `INSERT INTO public.tasks (household_id, title, created_by) VALUES ('${HOUSEHOLD}', 'Owner task', '${OWNER}') RETURNING id`,
    );
    await expectBlocked(asUser(db, MEMBER, `DELETE FROM public.tasks WHERE id = '${ownerTask}'`));
  });
});

describe("habits", () => {
  let today: string;
  let ownerMemberId: string;
  let memberMemberId: string;
  let sharedHabit: string;
  let ownerHabit: string;

  const daysAgo = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };

  beforeAll(async () => {
    today = await scalar<string>(`SELECT (timezone('utc', now()))::date::text`);
    ownerMemberId = await scalar<string>(
      `SELECT id FROM public.household_members WHERE household_id = '${HOUSEHOLD}' AND user_id = '${OWNER}'`,
    );
    memberMemberId = await scalar<string>(
      `SELECT id FROM public.household_members WHERE household_id = '${HOUSEHOLD}' AND user_id = '${MEMBER}'`,
    );
    sharedHabit = (
      await asUser<{ id: string }>(
        db,
        MEMBER,
        `INSERT INTO public.habits (household_id, title, start_date) VALUES ('${HOUSEHOLD}', 'Walk', '${daysAgo(30)}') RETURNING id`,
      )
    ).rows[0].id;
    ownerHabit = (
      await asUser<{ id: string }>(
        db,
        OWNER,
        `INSERT INTO public.habits (household_id, title, owner_member_id, goal_kind, target, unit, start_date)
         VALUES ('${HOUSEHOLD}', 'Water', '${ownerMemberId}', 'count', 2, 'L', '${daysAgo(30)}') RETURNING id`,
      )
    ).rows[0].id;
  });

  it("each partner checks in their own shared habit, never the other's", async () => {
    const own = await asUser(
      db,
      MEMBER,
      `INSERT INTO public.habit_checkins (habit_id, household_id, member_id, checkin_date, value)
       VALUES ('${sharedHabit}', '${HOUSEHOLD}', '${memberMemberId}', '${today}', 1)`,
    );
    expect(own.affectedRows).toBe(1);
    await expectBlocked(
      asUser(
        db,
        MEMBER,
        `INSERT INTO public.habit_checkins (habit_id, household_id, member_id, checkin_date, value)
         VALUES ('${sharedHabit}', '${HOUSEHOLD}', '${ownerMemberId}', '${today}', 1)`,
      ),
    );
  });

  it("personal habits accept check-ins only from their owner", async () => {
    await expectBlocked(
      asUser(
        db,
        MEMBER,
        `INSERT INTO public.habit_checkins (habit_id, household_id, member_id, checkin_date, value)
         VALUES ('${ownerHabit}', '${HOUSEHOLD}', '${memberMemberId}', '${today}', 1)`,
      ),
    );
  });

  it("rejects future dates and more than a week back", async () => {
    for (const date of [daysAgo(-1), daysAgo(8)]) {
      await expectBlocked(
        asUser(
          db,
          OWNER,
          `INSERT INTO public.habit_checkins (habit_id, household_id, member_id, checkin_date, value)
           VALUES ('${ownerHabit}', '${HOUSEHOLD}', '${ownerMemberId}', '${date}', 2)`,
        ),
      );
    }
  });

  it("a 7-day streak on a daily habit cheers the partner", async () => {
    // Six earlier days written by the system (no auth → date window not applied).
    for (let n = 6; n >= 1; n -= 1) {
      await db.exec(
        `INSERT INTO public.habit_checkins (habit_id, household_id, member_id, checkin_date, value)
         VALUES ('${ownerHabit}', '${HOUSEHOLD}', '${ownerMemberId}', '${daysAgo(n)}', 2)`,
      );
    }
    await asUser(
      db,
      OWNER,
      `INSERT INTO public.habit_checkins (habit_id, household_id, member_id, checkin_date, value)
       VALUES ('${ownerHabit}', '${HOUSEHOLD}', '${ownerMemberId}', '${today}', 2)`,
    );
    expect(
      await scalar<string>(
        `SELECT message FROM public.notifications WHERE user_id = '${MEMBER}' AND type = 'habit_streak'`,
      ),
    ).toMatch(/«Water» уже 7 дней подряд/);
    expect(
      await scalar<number>(
        `SELECT count(*)::int FROM public.notifications WHERE user_id = '${OWNER}' AND type = 'habit_streak'`,
      ),
    ).toBe(0);

    // Logging more water later the same day does not cheer again.
    await asUser(
      db,
      OWNER,
      `UPDATE public.habit_checkins SET value = 2.5
       WHERE habit_id = '${ownerHabit}' AND member_id = '${ownerMemberId}' AND checkin_date = '${today}'`,
    );
    expect(
      await scalar<number>(
        `SELECT count(*)::int FROM public.notifications WHERE user_id = '${MEMBER}' AND type = 'habit_streak'`,
      ),
    ).toBe(1);
  });

  it("validates goal and frequency shapes", async () => {
    for (const bad of [
      `'Check with target', 'check', 3, 'daily', NULL, NULL`,
      `'Days without days', 'check', 1, 'days', NULL, NULL`,
      `'Per week without times', 'check', 1, 'per_week', NULL, NULL`,
    ]) {
      await expectBlocked(
        asUser(
          db,
          MEMBER,
          `INSERT INTO public.habits (household_id, title, goal_kind, target, frequency, weekdays, times_per_week, start_date)
           VALUES ('${HOUSEHOLD}', ${bad}, '${today}')`,
        ),
      );
    }
  });
});

describe("meal plans", () => {
  let memberMemberId: string;
  let foodId: string;
  let mealId: string;

  beforeAll(async () => {
    memberMemberId = await scalar<string>(
      `SELECT id FROM public.household_members WHERE household_id = '${HOUSEHOLD}' AND user_id = '${MEMBER}'`,
    );
    foodId = (
      await asUser<{ id: string }>(
        db,
        MEMBER,
        `INSERT INTO public.foods (household_id, name, kcal, protein, fat, carbs, shopping_category)
         VALUES ('${HOUSEHOLD}', 'Овсянка', 370, 13, 6.5, 60, 'grains') RETURNING id`,
      )
    ).rows[0].id;
    const planId = (
      await asUser<{ id: string }>(
        db,
        MEMBER,
        `INSERT INTO public.meal_plans (household_id, name) VALUES ('${HOUSEHOLD}', 'Week') RETURNING id`,
      )
    ).rows[0].id;
    mealId = (
      await asUser<{ id: string }>(
        db,
        MEMBER,
        `INSERT INTO public.meal_plan_meals (plan_id, household_id, weekday, slot, title)
         VALUES ('${planId}', '${HOUSEHOLD}', 1, 'breakfast', 'Porridge') RETURNING id`,
      )
    ).rows[0].id;
  });

  it("stores per-person grams and keeps used foods from being deleted", async () => {
    const portion = await asUser(
      db,
      MEMBER,
      `INSERT INTO public.meal_plan_portions (meal_id, household_id, food_id, member_id, grams)
       VALUES ('${mealId}', '${HOUSEHOLD}', '${foodId}', '${memberMemberId}', 45)`,
    );
    expect(portion.affectedRows).toBe(1);
    await expectBlocked(asUser(db, MEMBER, `DELETE FROM public.foods WHERE id = '${foodId}'`));
  });

  it("allows only one active plan and unique food names per household", async () => {
    await expectBlocked(
      asUser(db, MEMBER, `INSERT INTO public.meal_plans (household_id, name) VALUES ('${HOUSEHOLD}', 'Second')`),
    );
    await expectBlocked(
      asUser(db, MEMBER, `INSERT INTO public.foods (household_id, name) VALUES ('${HOUSEHOLD}', ' овсянка ')`),
    );
  });

  it("rejects portions for another household's member and outsiders see nothing", async () => {
    const foreignMember = await scalar<string>(
      `SELECT id FROM public.household_members WHERE user_id = '${OUTSIDER}'`,
    );
    await expectBlocked(
      asUser(
        db,
        MEMBER,
        `INSERT INTO public.meal_plan_portions (meal_id, household_id, food_id, member_id, grams)
         VALUES ('${mealId}', '${HOUSEHOLD}', '${foodId}', '${foreignMember}', 10)`,
      ),
    );
    const { rows } = await asUser<{ n: number }>(
      db,
      OUTSIDER,
      `SELECT count(*)::int AS n FROM public.meal_plan_meals WHERE household_id = '${HOUSEHOLD}'`,
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("household deletion", () => {
  it("deleting the last owner row directly is still blocked", async () => {
    await expectBlocked(
      db.query(
        `DELETE FROM public.household_members
         WHERE household_id = '${HOUSEHOLD}' AND user_id = '${OWNER}'`,
      ),
    );
  });

  it("a whole household can be deleted despite the last-owner guard", async () => {
    await db.exec(`DELETE FROM public.households WHERE id = '${OTHER_HOUSEHOLD}'`);
    expect(
      await scalar<number>(
        `SELECT count(*)::int FROM public.household_members WHERE household_id = '${OTHER_HOUSEHOLD}'`,
      ),
    ).toBe(0);
  });
});
