import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin, canWrite } from "@/lib/auth/household";
import {
  buildAgenda,
  type Agenda,
  type AgendaTask,
  type TaskRepeat,
} from "@/lib/calculations/task-schedule";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import type {
  CreateTaskInput,
  SetTaskCompletionInput,
  UpdateTaskInput,
} from "@/lib/validations/task";
import { getHouseholdToday } from "@/services/settings-service";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB";
  message: string;
};

export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

/** "19:00:00" → "19:00" */
function shortTime(value: string | null): string | null {
  return value ? value.slice(0, 5) : null;
}

export function rowToRepeat(row: Pick<TaskRow, "repeat_kind" | "repeat_interval" | "repeat_weekdays" | "repeat_day_of_month">): TaskRepeat {
  switch (row.repeat_kind) {
    case "daily":
      return { kind: "daily", interval: row.repeat_interval };
    case "weekly":
      return { kind: "weekly", interval: row.repeat_interval, weekdays: row.repeat_weekdays ?? [] };
    case "monthly":
      return { kind: "monthly", interval: row.repeat_interval, dayOfMonth: row.repeat_day_of_month ?? 1 };
    default:
      return { kind: "none" };
  }
}

export function repeatToColumns(repeat: TaskRepeat): Pick<
  Database["public"]["Tables"]["tasks"]["Insert"],
  "repeat_kind" | "repeat_interval" | "repeat_weekdays" | "repeat_day_of_month"
> {
  switch (repeat.kind) {
    case "daily":
      return { repeat_kind: "daily", repeat_interval: repeat.interval, repeat_weekdays: null, repeat_day_of_month: null };
    case "weekly":
      return { repeat_kind: "weekly", repeat_interval: repeat.interval, repeat_weekdays: repeat.weekdays, repeat_day_of_month: null };
    case "monthly":
      return { repeat_kind: "monthly", repeat_interval: repeat.interval, repeat_weekdays: null, repeat_day_of_month: repeat.dayOfMonth };
    default:
      return { repeat_kind: "none", repeat_interval: 1, repeat_weekdays: null, repeat_day_of_month: null };
  }
}

export function rowToAgendaTask(row: TaskRow): AgendaTask {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    startDate: row.start_date,
    startTime: shortTime(row.start_time),
    endTime: shortTime(row.end_time),
    repeat: rowToRepeat(row),
    repeatUntil: row.repeat_until,
    assigneeMemberId: row.assignee_member_id,
    completedAt: row.completed_at,
  };
}

export async function listTasks(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{ data: TaskRow[] | null; error: ServiceError | null }> {
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("tasks")
      .select("*")
      .eq("household_id", ctx.householdId)
      .eq("is_archived", false)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) return { data: null, error: err("DB", error.message) };
  return { data: data ?? [], error: null };
}

/** Agenda for [from, to] plus overdue one-offs and undated tasks. */
export async function getAgenda(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  range: { from: string; to: string },
): Promise<{
  data: { agenda: Agenda; tasks: TaskRow[]; today: string } | null;
  error: ServiceError | null;
}> {
  const [tasksResult, completionsResult, { today }] = await Promise.all([
    listTasks(supabase, ctx),
    fetchAllPages((from, to) =>
      supabase
        .from("task_completions")
        .select("id, task_id, occurrence_date")
        .eq("household_id", ctx.householdId)
        .gte("occurrence_date", range.from)
        .lte("occurrence_date", range.to)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    getHouseholdToday(supabase, ctx),
  ]);
  if (tasksResult.error || !tasksResult.data) return { data: null, error: tasksResult.error };
  if (completionsResult.error) {
    return { data: null, error: err("DB", completionsResult.error.message) };
  }

  const completions = new Map<string, Set<string>>();
  for (const row of completionsResult.data ?? []) {
    const set = completions.get(row.task_id) ?? new Set<string>();
    set.add(row.occurrence_date);
    completions.set(row.task_id, set);
  }

  return {
    data: {
      agenda: buildAgenda({
        tasks: tasksResult.data.map(rowToAgendaTask),
        completions,
        from: range.from,
        to: range.to,
        today,
      }),
      tasks: tasksResult.data,
      today,
    },
    error: null,
  };
}

export async function createTask(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: CreateTaskInput,
): Promise<{ data: TaskRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { data: null, error: err("FORBIDDEN", "Наблюдатели не могут добавлять дела") };
  }

  const repeat = input.repeat ?? { kind: "none" };
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      household_id: ctx.householdId,
      title: input.title,
      notes: input.notes || null,
      assignee_member_id: input.assigneeMemberId ?? null,
      kind: input.startTime ? "event" : "task",
      start_date: input.startDate ?? null,
      start_time: input.startTime ?? null,
      end_time: input.endTime ?? null,
      repeat_until: repeat.kind === "none" ? null : (input.repeatUntil ?? null),
      created_by: ctx.user.id,
      ...repeatToColumns(repeat),
    })
    .select("*")
    .single();

  if (error || !data) {
    return { data: null, error: err("DB", error?.message ?? "Не получилось добавить дело") };
  }
  return { data, error: null };
}

async function loadTask(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  taskId: string,
): Promise<{ data: TaskRow | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();
  if (error) return { data: null, error: err("DB", error.message) };
  if (!data) return { data: null, error: err("NOT_FOUND", "Дело не найдено") };
  return { data, error: null };
}

export async function updateTask(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  taskId: string,
  input: UpdateTaskInput,
): Promise<{ data: TaskRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { data: null, error: err("FORBIDDEN", "Наблюдатели не могут менять дела") };
  }
  const existing = await loadTask(supabase, ctx, taskId);
  if (existing.error || !existing.data) return existing;
  const current = existing.data;

  const patch: Database["public"]["Tables"]["tasks"]["Update"] = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.notes !== undefined) patch.notes = input.notes || null;
  if (input.assigneeMemberId !== undefined) patch.assignee_member_id = input.assigneeMemberId;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.startTime !== undefined) patch.start_time = input.startTime;
  if (input.endTime !== undefined) patch.end_time = input.endTime;
  if (input.isArchived !== undefined) patch.is_archived = input.isArchived;
  if (input.repeat !== undefined) {
    Object.assign(patch, repeatToColumns(input.repeat));
    if (input.repeat.kind !== "none") {
      // completed_at is for one-offs only (DB constraint).
      patch.completed_at = null;
      patch.completed_by = null;
    }
  }
  const nextRepeatKind = patch.repeat_kind ?? current.repeat_kind;
  if (input.repeatUntil !== undefined || nextRepeatKind === "none") {
    patch.repeat_until = nextRepeatKind === "none" ? null : (input.repeatUntil ?? null);
  }

  const nextStartTime = input.startTime !== undefined ? input.startTime : shortTime(current.start_time);
  patch.kind = nextStartTime ? "event" : "task";
  if (!nextStartTime) patch.end_time = null;

  // Cross-field rules against the merged row (the schema only sees the patch).
  const nextStartDate = input.startDate !== undefined ? input.startDate : current.start_date;
  if (nextRepeatKind !== "none" && !nextStartDate) {
    return { data: null, error: err("VALIDATION", "Для повтора нужна дата начала") };
  }
  if (nextStartTime && !nextStartDate) {
    return { data: null, error: err("VALIDATION", "Для времени нужна дата") };
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("household_id", ctx.householdId)
    .select("*")
    .single();
  if (error || !data) {
    return { data: null, error: err("DB", error?.message ?? "Не получилось сохранить дело") };
  }
  return { data, error: null };
}

export async function deleteTask(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  taskId: string,
): Promise<{ error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { error: err("FORBIDDEN", "Наблюдатели не могут удалять дела") };
  }
  const existing = await loadTask(supabase, ctx, taskId);
  if (existing.error || !existing.data) return { error: existing.error };
  if (!canAdmin(ctx.role) && existing.data.created_by !== ctx.user.id) {
    return { error: err("FORBIDDEN", "Удалить это дело может только автор или владелец/админ") };
  }

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("household_id", ctx.householdId);
  if (error) return { error: err("DB", error.message) };
  return { error: null };
}

/**
 * Tick an item off (or undo). Repeating tasks record the occurrence date;
 * one-offs set completed_at on the task itself.
 */
export async function setTaskCompletion(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  taskId: string,
  input: SetTaskCompletionInput,
): Promise<{ error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { error: err("FORBIDDEN", "Наблюдатели не могут отмечать дела") };
  }
  const existing = await loadTask(supabase, ctx, taskId);
  if (existing.error || !existing.data) return { error: existing.error };
  const task = existing.data;

  if (task.repeat_kind !== "none") {
    if (!input.date) {
      return { error: err("VALIDATION", "Для повторяющегося дела нужна дата") };
    }
    if (input.done) {
      const { error } = await supabase.from("task_completions").upsert(
        {
          task_id: task.id,
          household_id: ctx.householdId,
          occurrence_date: input.date,
          completed_by: ctx.user.id,
        },
        { onConflict: "task_id,occurrence_date", ignoreDuplicates: true },
      );
      if (error) return { error: err("DB", error.message) };
    } else {
      const { error } = await supabase
        .from("task_completions")
        .delete()
        .eq("household_id", ctx.householdId)
        .eq("task_id", task.id)
        .eq("occurrence_date", input.date);
      if (error) return { error: err("DB", error.message) };
    }
    return { error: null };
  }

  const { error } = await supabase
    .from("tasks")
    .update(
      input.done
        ? { completed_at: new Date().toISOString(), completed_by: ctx.user.id }
        : { completed_at: null, completed_by: null },
    )
    .eq("id", task.id)
    .eq("household_id", ctx.householdId);
  if (error) return { error: err("DB", error.message) };
  return { error: null };
}
