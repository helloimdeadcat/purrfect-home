import { describe, expect, it, vi } from "vitest";

import type { TaskRepeat } from "@/lib/calculations/task-schedule";
import { makeCtx, queryChain, TEST_USER_ID } from "@/lib/test-utils/household-context";

import {
  deleteTask,
  repeatToColumns,
  rowToRepeat,
  setTaskCompletion,
  updateTask,
} from "./task-service";

const TASK_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    household_id: "33333333-3333-3333-3333-333333333333",
    title: "Vacuum",
    notes: null,
    assignee_member_id: null,
    kind: "task",
    start_date: "2026-10-26",
    start_time: null,
    end_time: null,
    repeat_kind: "none",
    repeat_interval: 1,
    repeat_weekdays: null,
    repeat_day_of_month: null,
    repeat_until: null,
    completed_at: null,
    completed_by: null,
    created_by: "99999999-9999-9999-9999-999999999999",
    is_archived: false,
    created_at: "2026-10-26T00:00:00Z",
    updated_at: "2026-10-26T00:00:00Z",
    ...overrides,
  };
}

describe("repeat <-> columns", () => {
  it("round-trips every repeat kind", () => {
    const repeats: TaskRepeat[] = [
      { kind: "none" },
      { kind: "daily", interval: 2 },
      { kind: "weekly", interval: 1, weekdays: [1, 3, 5] },
      { kind: "monthly", interval: 3, dayOfMonth: 31 },
    ];
    for (const repeat of repeats) {
      expect(rowToRepeat(repeatToColumns(repeat) as never)).toEqual(repeat);
    }
  });
});

describe("deleteTask", () => {
  it("lets a member delete only tasks they created", async () => {
    const supabase = { from: vi.fn(() => queryChain({ data: taskRow(), error: null })) };
    const { error } = await deleteTask(supabase as never, makeCtx({ role: "member" }), TASK_ID);
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("forbids viewers before touching the database", async () => {
    const from = vi.fn();
    const { error } = await deleteTask({ from } as never, makeCtx({ role: "viewer" }), TASK_ID);
    expect(error?.code).toBe("FORBIDDEN");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("setTaskCompletion", () => {
  it("records a repeating occurrence by date", async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = {
      from: vi.fn((table: string) =>
        table === "tasks"
          ? queryChain({ data: taskRow({ repeat_kind: "daily" }), error: null })
          : { upsert },
      ),
    };
    const { error } = await setTaskCompletion(supabase as never, makeCtx(), TASK_ID, {
      date: "2026-10-27",
      done: true,
    });
    expect(error).toBeNull();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: TASK_ID, occurrence_date: "2026-10-27", completed_by: TEST_USER_ID }),
      expect.anything(),
    );
  });

  it("requires a date for repeating tasks", async () => {
    const supabase = {
      from: vi.fn(() => queryChain({ data: taskRow({ repeat_kind: "weekly", repeat_weekdays: [1] }), error: null })),
    };
    const { error } = await setTaskCompletion(supabase as never, makeCtx(), TASK_ID, { done: true });
    expect(error?.code).toBe("VALIDATION");
  });

  it("marks one-offs complete on the task row", async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: vi.fn(() => {
        const chain = queryChain({ data: taskRow(), error: null }) as Record<string, unknown>;
        chain.update = (patch: unknown) => {
          updates.push(patch);
          return chain;
        };
        return chain;
      }),
    };
    const { error } = await setTaskCompletion(supabase as never, makeCtx(), TASK_ID, { done: true });
    expect(error).toBeNull();
    expect(updates[0]).toEqual(expect.objectContaining({ completed_by: TEST_USER_ID }));
  });
});

describe("updateTask", () => {
  it("clears one-off completion when an item becomes repeating, and derives kind from time", async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = {
      from: vi.fn(() => {
        const chain = queryChain({ data: taskRow({ completed_at: "2026-10-26T10:00:00Z" }), error: null }) as Record<string, unknown>;
        chain.update = (patch: Record<string, unknown>) => {
          updates.push(patch);
          return chain;
        };
        return chain;
      }),
    };
    const { error } = await updateTask(supabase as never, makeCtx(), TASK_ID, {
      repeat: { kind: "weekly", interval: 1, weekdays: [6] },
      startTime: "10:00",
    });
    expect(error).toBeNull();
    expect(updates[0]).toEqual(
      expect.objectContaining({
        repeat_kind: "weekly",
        repeat_weekdays: [6],
        completed_at: null,
        kind: "event",
      }),
    );
  });

  it("refuses a repeat without a start date on the merged row", async () => {
    const supabase = { from: vi.fn(() => queryChain({ data: taskRow({ start_date: null }), error: null })) };
    const { error } = await updateTask(supabase as never, makeCtx(), TASK_ID, {
      repeat: { kind: "daily", interval: 1 },
    });
    expect(error?.code).toBe("VALIDATION");
  });
});
