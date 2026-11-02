import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { asUser, createMigratedDb, readMigration } from "./pglite-db";

const MIGRATION = "20261027100000_russian_db_texts.sql";

const OWNER = "00000000-0000-0000-0000-0000000000d1";
const PARTNER = "00000000-0000-0000-0000-0000000000d2";
const OLD_HOUSEHOLD = "10000000-0000-0000-0000-0000000000d1";
const BUSY_HOUSEHOLD = "10000000-0000-0000-0000-0000000000d2";

let db: PGlite;

async function rows<T>(sql: string): Promise<T[]> {
  return (await db.query<T>(sql)).rows;
}

beforeAll(async () => {
  db = await createMigratedDb();
  // Data written before the migration: English seed templates, an untouched
  // household copy, a renamed/customised one, and English notifications.
  await db.exec(`
    INSERT INTO public.categories (id, household_id, name, icon, color, type, parent_id, is_system, sort_order) VALUES
      ('11111111-1111-1111-1111-111111111102', NULL, 'Food', 'utensils', '#F97316', 'expense', NULL, true, 20),
      ('11111111-1111-1111-1111-111111111121', NULL, 'Groceries', 'shopping-cart', '#F97316', 'expense',
        '11111111-1111-1111-1111-111111111102', true, 21),
      ('11111111-1111-1111-1111-111111111201', NULL, 'Salary', 'briefcase', '#22C55E', 'income', NULL, true, 10);

    INSERT INTO auth.users VALUES ('${OWNER}', 'owner@example.com'), ('${PARTNER}', 'partner@example.com');
    INSERT INTO public.profiles (id, email) VALUES ('${OWNER}', 'owner@example.com'), ('${PARTNER}', 'partner@example.com');
    INSERT INTO public.households (id, name) VALUES ('${OLD_HOUSEHOLD}', 'Old'), ('${BUSY_HOUSEHOLD}', 'Busy');

    INSERT INTO public.categories (household_id, name, icon, type) VALUES
      ('${OLD_HOUSEHOLD}', 'Food', 'utensils', 'expense'),          -- untouched → renamed
      ('${OLD_HOUSEHOLD}', 'Salary', 'piggy-bank', 'income'),      -- icon changed → kept
      ('${OLD_HOUSEHOLD}', 'Rent', 'home', 'expense'),             -- custom → kept
      ('${BUSY_HOUSEHOLD}', 'Groceries', 'shopping-cart', 'expense'),
      ('${BUSY_HOUSEHOLD}', 'Продукты', 'shopping-cart', 'expense'); -- name taken → kept

    INSERT INTO public.notifications (user_id, household_id, type, title, message) VALUES
      ('${OWNER}', '${OLD_HOUSEHOLD}', 'member_role_changed', 'Your role changed', 'Your role is now admin.'),
      ('${OWNER}', '${OLD_HOUSEHOLD}', 'member_joined', 'New family member', 'Anna joined the household.'),
      ('${OWNER}', '${OLD_HOUSEHOLD}', 'habit_streak', 'Streak: 30 days 🎉', 'Anna kept "Walk" for 30 days in a row. Send some love!'),
      ('${OWNER}', '${OLD_HOUSEHOLD}', 'recurring_paid', 'Recurring payment confirmed', 'Anna confirmed Rent (700.00 EUR, due 2026-10-01).');
  `);
  // Re-apply twice: translates the rows above and proves idempotency.
  await db.exec(readMigration(MIGRATION));
  await db.exec(readMigration(MIGRATION));
}, 60_000);

describe("russian db texts migration", () => {
  it("translates untouched default categories only", async () => {
    const templates = await rows<{ name: string }>(
      `SELECT name FROM public.categories WHERE household_id IS NULL ORDER BY sort_order, name`,
    );
    expect(templates.map((r) => r.name)).toEqual(["Зарплата", "Еда", "Продукты"]);

    const old = await rows<{ name: string }>(
      `SELECT name FROM public.categories WHERE household_id = '${OLD_HOUSEHOLD}' ORDER BY name`,
    );
    expect(old.map((r) => r.name)).toEqual(["Rent", "Salary", "Еда"]);

    const busy = await rows<{ name: string }>(
      `SELECT name FROM public.categories WHERE household_id = '${BUSY_HOUSEHOLD}' ORDER BY name`,
    );
    expect(busy.map((r) => r.name)).toEqual(["Groceries", "Продукты"]);
  });

  it("translates existing notification titles and fixed messages", async () => {
    const list = await rows<{ type: string; title: string; message: string }>(
      `SELECT type, title, message FROM public.notifications
       WHERE household_id = '${OLD_HOUSEHOLD}' ORDER BY type`,
    );
    expect(list).toEqual([
      { type: "habit_streak", title: "Серия: 30 дней подряд 🎉",
        message: 'Anna kept "Walk" for 30 days in a row. Send some love!' },
      { type: "member_joined", title: "Новый участник семьи", message: "Anna теперь с вами в семье 🏡" },
      { type: "member_role_changed", title: "Твоя роль изменилась", message: "Теперь твоя роль: админ." },
      { type: "recurring_paid", title: "Регулярный платёж оплачен",
        message: "Anna confirmed Rent (700.00 EUR, due 2026-10-01)." },
    ]);
  });

  it("bootstraps a new household with Russian defaults", async () => {
    const { rows: boot } = await asUser<{ household_id: string; created: boolean }>(
      db,
      OWNER,
      `SELECT * FROM public.bootstrap_first_household_for_user(
         '${OWNER}', 'owner@example.com', NULL, NULL, '', 'EUR')`,
    );
    expect(boot[0]?.created).toBe(true);
    const householdId = boot[0]!.household_id;

    const categories = await rows<{ name: string; parent: string | null }>(
      `SELECT c.name, p.name AS parent FROM public.categories c
       LEFT JOIN public.categories p ON p.id = c.parent_id
       WHERE c.household_id = '${householdId}' ORDER BY c.type, c.sort_order`,
    );
    expect(categories).toEqual([
      { name: "Еда", parent: null },
      { name: "Продукты", parent: "Еда" },
      { name: "Зарплата", parent: null },
    ]);
    const [names] = await rows<{ household: string; account: string }>(
      `SELECT h.name AS household, a.name AS account FROM public.households h
       JOIN public.accounts a ON a.household_id = h.id WHERE h.id = '${householdId}'`,
    );
    expect(names).toEqual({ household: "Наша семья", account: "Наличные" });

    // Trigger texts: a partner joins, then gets promoted by the owner.
    await db.exec(
      `INSERT INTO public.household_members (household_id, user_id, role, display_name)
       VALUES ('${householdId}', '${PARTNER}', 'member', 'Лиза')`,
    );
    const [joined] = await rows<{ title: string; message: string }>(
      `SELECT title, message FROM public.notifications
       WHERE user_id = '${OWNER}' AND household_id = '${householdId}' AND type = 'member_joined'`,
    );
    expect(joined).toEqual({ title: "Новый участник семьи", message: "Лиза теперь с вами в семье 🏡" });

    await asUser(
      db,
      OWNER,
      `UPDATE public.household_members SET role = 'admin'
       WHERE household_id = '${householdId}' AND user_id = '${PARTNER}'`,
    );
    const [promoted] = await rows<{ title: string; message: string }>(
      `SELECT title, message FROM public.notifications
       WHERE user_id = '${PARTNER}' AND type = 'member_role_changed'`,
    );
    expect(promoted).toEqual({ title: "Твоя роль изменилась", message: "Теперь твоя роль: админ." });
  });
});
