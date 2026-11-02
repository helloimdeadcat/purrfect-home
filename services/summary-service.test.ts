import { describe, expect, it, vi } from "vitest";

import { shortMoney } from "@/lib/summary/daily-summary";
import { makeCtx, queryChain } from "@/lib/test-utils/household-context";

import { buildDailySummary, buildMorningDigests } from "./summary-service";

const H = "33333333-3333-3333-3333-333333333333";
const ME = "22222222-2222-2222-2222-222222222222";
const PARTNER = "44444444-4444-4444-4444-444444444444";
const TODAY = "2026-10-27";
const NOW = new Date(`${TODAY}T06:00:00Z`);

type Result = { data: unknown; error: null | { message: string } };

/** Admin client stub: table → result (or a thrower); counts every from(). */
function stubClient(tables: Record<string, Result | (() => never)>) {
  const calls: string[] = [];
  const client = {
    from: vi.fn((table: string) => {
      calls.push(table);
      const entry = tables[table];
      if (typeof entry === "function") entry();
      return queryChain((entry as Result) ?? { data: null, error: { message: `relation "${table}" does not exist` } });
    }),
  };
  return { client: client as never, calls };
}

const baseTables: Record<string, Result> = {
  household_members: {
    data: [
      { id: ME, user_id: "user-me", household_id: H, display_name: "Эмма", joined_at: "2026-01-01" },
      { id: PARTNER, user_id: "user-partner", household_id: H, display_name: null, joined_at: "2026-01-02" },
    ],
    error: null,
  },
  households: { data: [{ id: H, base_currency: "EUR" }], error: null },
  household_settings: { data: [{ household_id: H, timezone: "UTC" }], error: null },
  tasks: {
    data: [
      {
        id: "t1", title: "Купить корм", kind: "task", start_date: TODAY, start_time: null, end_time: null,
        repeat_kind: "none", repeat_interval: 1, repeat_weekdays: null, repeat_day_of_month: null,
        repeat_until: null, assignee_member_id: ME, completed_at: null,
      },
      {
        id: "t2", title: "Прогулка", kind: "event", start_date: "2026-10-01", start_time: "19:00:00", end_time: null,
        repeat_kind: "daily", repeat_interval: 1, repeat_weekdays: null, repeat_day_of_month: null,
        repeat_until: null, assignee_member_id: null, completed_at: null,
      },
    ],
    error: null,
  },
  task_completions: { data: [], error: null },
  meal_plans: { data: { id: "plan" }, error: null },
  nutrition_targets: { data: [], error: null },
  meal_plan_meals: { data: [{ id: "m1", slot: "breakfast", title: "Овсянка", position: 0 }], error: null },
  meal_plan_portions: { data: [{ meal_id: "m1", food_id: "f1", member_id: ME, grams: "100" }], error: null },
  foods: { data: [{ id: "f1", kcal: "420" }], error: null },
  accounts: { data: [{ id: "a1", currency: "EUR", initial_balance: "100.00", is_active: true }], error: null },
  transactions: {
    data: [{ id: "x1", account_id: "a1", type: "expense", amount: "14.60", adjustment_direction: null }],
    error: null,
  },
  transfers: { data: [], error: null },
  recurring_payments: { data: [], error: null },
  recurring_payment_occurrences: { data: [], error: null },
  // habits / habit_checkins missing: migration not applied.
};

describe("buildMorningDigests", () => {
  it("builds one digest per member and degrades a missing habits table", async () => {
    const { client, calls } = stubClient(baseTables);
    const digests = await buildMorningDigests(client, NOW);
    const sts = shortMoney("85.40", "EUR");

    expect(digests).toEqual([
      {
        userId: "user-me",
        title: "Доброе утро, Эмма! ☀️",
        body: `2 дела (1 вместе) · завтрак 420 ккал · можно потратить ${sts}`,
        url: "/app/dashboard",
      },
      {
        userId: "user-partner",
        title: "Доброе утро! ☀️",
        body: `1 дело (1 вместе) · можно потратить ${sts}`,
        url: "/app/dashboard",
      },
    ]);
    // 3 shared + 14 per household (tasks 2, habits 2, meals 5, money 5).
    expect(calls).toHaveLength(17);
  });

  it("keeps going when a whole section throws and skips members with nothing to say", async () => {
    const { client } = stubClient({
      ...baseTables,
      tasks: { data: [], error: null },
      meal_plans: { data: null, error: null },
      transactions: (() => {
        throw new Error("network");
      }) as () => never,
    });
    expect(await buildMorningDigests(client, NOW)).toEqual([]);
  });

  it("returns nothing when members cannot be read", async () => {
    const { client } = stubClient({});
    expect(await buildMorningDigests(client, NOW)).toEqual([]);
  });
});

describe("buildDailySummary", () => {
  it("marks every section unavailable instead of failing when tables are missing", async () => {
    const { client } = stubClient({});
    const summary = await buildDailySummary(client, makeCtx(), { today: TODAY, taskView: null });
    expect(summary).toEqual({
      today: TODAY,
      tasks: { ok: false },
      meals: { ok: false },
      habits: { ok: false },
      money: { ok: false },
    });
  });

  it("loads meals and habits for the current member with lean queries", async () => {
    const { client } = stubClient({
      ...baseTables,
      habits: {
        data: [
          {
            id: "h1", title: "Вода", emoji: "💧", owner_member_id: null, goal_kind: "check", target: "1.00",
            unit: null, frequency: "daily", weekdays: null, times_per_week: null, start_date: "2026-01-01",
          },
        ],
        error: null,
      },
      habit_checkins: { data: [], error: null },
      profiles: { data: [], error: null },
    });
    const summary = await buildDailySummary(client, makeCtx(), { today: TODAY, taskView: null });
    expect(summary.habits).toEqual({ ok: true, data: [{ id: "h1", title: "Вода", emoji: "💧" }] });
    expect(summary.meals.ok && summary.meals.data.byMember[ME].kcal).toBe(420);
    expect(summary.tasks).toEqual({ ok: false });
  });
});
