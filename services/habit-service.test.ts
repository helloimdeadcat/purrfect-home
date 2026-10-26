import { describe, expect, it, vi } from "vitest";

import type { HabitFrequency, HabitGoal } from "@/lib/calculations/habits";
import { makeCtx, queryChain } from "@/lib/test-utils/household-context";

import { rowToRules, rulesToColumns, setHabitCheckin } from "./habit-service";

const HABIT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const ME = "22222222-2222-2222-2222-222222222222"; // makeCtx membershipId
const PARTNER = "44444444-4444-4444-4444-444444444444";
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

function habitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: HABIT_ID,
    household_id: "33333333-3333-3333-3333-333333333333",
    title: "Water",
    emoji: "💧",
    owner_member_id: null,
    goal_kind: "check",
    target: "1.00",
    unit: null,
    frequency: "daily",
    weekdays: null,
    times_per_week: null,
    start_date: "2026-01-01",
    is_archived: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Supabase stub: habits → row, household_settings → UTC, habit_checkins → recorder. */
function stub(row: Record<string, unknown>) {
  const writes: { op: string; payload?: unknown }[] = [];
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "habits") return queryChain({ data: row, error: null });
      if (table === "household_settings") return queryChain({ data: { timezone: "UTC" }, error: null });
      const chain = queryChain({ data: null, error: null }) as Record<string, unknown>;
      chain.upsert = (payload: unknown) => {
        writes.push({ op: "upsert", payload });
        return Promise.resolve({ error: null });
      };
      chain.delete = () => {
        writes.push({ op: "delete" });
        return chain;
      };
      return chain;
    }),
  };
  return { supabase, writes };
}

describe("rules <-> columns", () => {
  it("round-trips goals and frequencies", () => {
    const cases: [HabitGoal, HabitFrequency][] = [
      [{ kind: "check" }, { kind: "daily" }],
      [{ kind: "count", target: 2.5, unit: "L" }, { kind: "days", weekdays: [1, 3, 5] }],
      [{ kind: "count", target: 8, unit: null }, { kind: "per_week", times: 3 }],
    ];
    for (const [goal, frequency] of cases) {
      const row = habitRow({ ...rulesToColumns(goal, frequency), target: String(rulesToColumns(goal, frequency).target) });
      const rules = rowToRules(row as never);
      expect(rules.goal).toEqual(goal);
      expect(rules.frequency).toEqual(frequency);
    }
  });
});

describe("setHabitCheckin", () => {
  it("refuses check-ins on the partner's personal habit", async () => {
    const { supabase } = stub(habitRow({ owner_member_id: PARTNER }));
    const { error } = await setHabitCheckin(supabase as never, makeCtx({ role: "member" }), HABIT_ID, {
      date: today,
      value: 1,
    });
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("allows up to 7 days back, not 8 and not the future", async () => {
    for (const [date, ok] of [
      [daysAgo(7), true],
      [daysAgo(8), false],
      [daysAgo(-1), false],
    ] as const) {
      const { supabase } = stub(habitRow());
      const { error } = await setHabitCheckin(supabase as never, makeCtx(), HABIT_ID, { date, value: 1 });
      expect(error === null).toBe(ok);
    }
  });

  it("stores 1 for tick habits, the rounded amount for count habits, and deletes on 0", async () => {
    const tick = stub(habitRow());
    await setHabitCheckin(tick.supabase as never, makeCtx(), HABIT_ID, { date: today, value: 5 });
    expect(tick.writes[0]).toEqual({
      op: "upsert",
      payload: expect.objectContaining({ member_id: ME, value: 1, checkin_date: today }),
    });

    const count = stub(habitRow({ goal_kind: "count", target: "2.00", unit: "L" }));
    await setHabitCheckin(count.supabase as never, makeCtx(), HABIT_ID, { date: today, value: 1.255 });
    expect((count.writes[0].payload as { value: number }).value).toBe(1.26);

    const clear = stub(habitRow());
    await setHabitCheckin(clear.supabase as never, makeCtx(), HABIT_ID, { date: today, value: 0 });
    expect(clear.writes[0].op).toBe("delete");
  });
});
