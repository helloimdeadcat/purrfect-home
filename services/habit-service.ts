import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin, canWrite } from "@/lib/auth/household";
import {
  canCheckIn,
  completionRate,
  currentStreak,
  dayStatus,
  roundAmount,
  weekCount,
  type CheckinMap,
  type DayStatus,
  type HabitFrequency,
  type HabitGoal,
  type HabitRules,
  type Streak,
} from "@/lib/calculations/habits";
import { addDays } from "@/lib/calculations/task-schedule";
import { buildPeople, type Person } from "@/lib/people";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import type {
  CreateHabitInput,
  HabitCheckinInput,
  UpdateHabitInput,
} from "@/lib/validations/habit";
import { listFamilyMembers } from "@/services/family-service";
import { getHouseholdToday } from "@/services/settings-service";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB";
  message: string;
};

export type HabitRow = Database["public"]["Tables"]["habits"]["Row"];

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

/** History loaded for streaks and stats (a year plus slack). */
const HISTORY_DAYS = 400;
/** Days shown in each person's strip. */
export const STRIP_DAYS = 7;

export function rowToRules(row: HabitRow): HabitRules {
  const frequency: HabitFrequency =
    row.frequency === "days"
      ? { kind: "days", weekdays: row.weekdays ?? [] }
      : row.frequency === "per_week"
        ? { kind: "per_week", times: row.times_per_week ?? 1 }
        : { kind: "daily" };
  const goal: HabitGoal =
    row.goal_kind === "count" ? { kind: "count", target: Number(row.target), unit: row.unit } : { kind: "check" };
  return { startDate: row.start_date, frequency, goal };
}

export function rulesToColumns(
  goal: HabitGoal,
  frequency: HabitFrequency,
): Pick<
  Database["public"]["Tables"]["habits"]["Insert"],
  "goal_kind" | "target" | "unit" | "frequency" | "weekdays" | "times_per_week"
> {
  return {
    goal_kind: goal.kind,
    target: goal.kind === "count" ? goal.target : 1,
    unit: goal.kind === "count" ? (goal.unit || null) : null,
    frequency: frequency.kind,
    weekdays: frequency.kind === "days" ? frequency.weekdays : null,
    times_per_week: frequency.kind === "per_week" ? frequency.times : null,
  };
}

export type HabitParticipantView = {
  person: Person;
  /** Oldest → newest, ending today. */
  strip: { date: string; status: DayStatus; value: number; canEdit: boolean }[];
  todayValue: number;
  streak: Streak;
  rate30: number | null;
  /** per_week habits: completions this ISO week. */
  thisWeek: number | null;
  isYou: boolean;
};

export type HabitView = {
  habit: HabitRow;
  rules: HabitRules;
  participants: HabitParticipantView[];
  canManage: boolean;
  canDelete: boolean;
};

export async function loadHabitBoard(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{
  data: { today: string; habits: HabitView[]; people: ReturnType<typeof buildPeople> } | null;
  error: ServiceError | null;
}> {
  const { today } = await getHouseholdToday(supabase, ctx);
  const since = addDays(today, -HISTORY_DAYS);

  const [habitsResult, checkinsResult, membersResult] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("habits")
        .select("*")
        .eq("household_id", ctx.householdId)
        .eq("is_archived", false)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("habit_checkins")
        .select("id, habit_id, member_id, checkin_date, value")
        .eq("household_id", ctx.householdId)
        .gte("checkin_date", since)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    listFamilyMembers(supabase, ctx),
  ]);
  if (habitsResult.error) return { data: null, error: err("DB", habitsResult.error.message) };
  if (checkinsResult.error) return { data: null, error: err("DB", checkinsResult.error.message) };

  const people = buildPeople(membersResult.data ?? [], ctx.user.id);

  // habitId → memberId → date → value
  const checkins = new Map<string, Map<string, CheckinMap>>();
  for (const row of checkinsResult.data ?? []) {
    const byMember = checkins.get(row.habit_id) ?? new Map<string, CheckinMap>();
    const byDate = byMember.get(row.member_id) ?? new Map<string, number>();
    byDate.set(row.checkin_date, Number(row.value));
    byMember.set(row.member_id, byDate);
    checkins.set(row.habit_id, byMember);
  }

  const writer = canWrite(ctx.role);
  const habits: HabitView[] = (habitsResult.data ?? []).map((habit) => {
    const rules = rowToRules(habit);
    const participants = (
      habit.owner_member_id
        ? people.list.filter((p) => p.memberId === habit.owner_member_id)
        : people.list
    ).map((person): HabitParticipantView => {
      const map = checkins.get(habit.id)?.get(person.memberId!) ?? new Map<string, number>();
      const isYou = person.isYou;
      return {
        person,
        isYou,
        strip: Array.from({ length: STRIP_DAYS }, (_, i) => {
          const date = addDays(today, i - (STRIP_DAYS - 1));
          return {
            date,
            status: dayStatus(rules, map, date, today),
            value: map.get(date) ?? 0,
            canEdit: isYou && writer && date >= rules.startDate && canCheckIn(date, today),
          };
        }),
        todayValue: map.get(today) ?? 0,
        streak: currentStreak(rules, map, today),
        rate30: completionRate(rules, map, today, 30),
        thisWeek: rules.frequency.kind === "per_week" ? weekCount(rules, map, today) : null,
      };
    });
    // Your own row first.
    participants.sort((a, b) => Number(b.isYou) - Number(a.isYou));
    return {
      habit,
      rules,
      participants,
      canManage: writer,
      canDelete: writer && (canAdmin(ctx.role) || habit.created_by === ctx.user.id),
    };
  });

  return { data: { today, habits, people }, error: null };
}

export async function createHabit(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: CreateHabitInput,
): Promise<{ data: HabitRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) return { data: null, error: err("FORBIDDEN", "Viewers cannot add habits") };
  const startDate = input.startDate ?? (await getHouseholdToday(supabase, ctx)).today;

  const { data, error } = await supabase
    .from("habits")
    .insert({
      household_id: ctx.householdId,
      title: input.title,
      emoji: input.emoji || null,
      owner_member_id: input.ownerMemberId ?? null,
      start_date: startDate,
      created_by: ctx.user.id,
      ...rulesToColumns(input.goal, input.frequency),
    })
    .select("*")
    .single();
  if (error || !data) return { data: null, error: err("DB", error?.message ?? "Failed to add habit") };
  return { data, error: null };
}

async function loadHabit(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  habitId: string,
): Promise<{ data: HabitRow | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from("habits")
    .select("*")
    .eq("id", habitId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();
  if (error) return { data: null, error: err("DB", error.message) };
  if (!data) return { data: null, error: err("NOT_FOUND", "Habit not found") };
  return { data, error: null };
}

export async function updateHabit(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  habitId: string,
  input: UpdateHabitInput,
): Promise<{ data: HabitRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) return { data: null, error: err("FORBIDDEN", "Viewers cannot edit habits") };
  const existing = await loadHabit(supabase, ctx, habitId);
  if (existing.error || !existing.data) return existing;
  const current = rowToRules(existing.data);

  const patch: Database["public"]["Tables"]["habits"]["Update"] = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.emoji !== undefined) patch.emoji = input.emoji || null;
  if (input.ownerMemberId !== undefined) patch.owner_member_id = input.ownerMemberId;
  if (input.isArchived !== undefined) patch.is_archived = input.isArchived;
  if (input.goal !== undefined || input.frequency !== undefined) {
    Object.assign(patch, rulesToColumns(input.goal ?? current.goal, input.frequency ?? current.frequency));
  }

  const { data, error } = await supabase
    .from("habits")
    .update(patch)
    .eq("id", habitId)
    .eq("household_id", ctx.householdId)
    .select("*")
    .single();
  if (error || !data) return { data: null, error: err("DB", error?.message ?? "Failed to update habit") };
  return { data, error: null };
}

export async function deleteHabit(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  habitId: string,
): Promise<{ error: ServiceError | null }> {
  if (!canWrite(ctx.role)) return { error: err("FORBIDDEN", "Viewers cannot delete habits") };
  const existing = await loadHabit(supabase, ctx, habitId);
  if (existing.error || !existing.data) return { error: existing.error };
  if (!canAdmin(ctx.role) && existing.data.created_by !== ctx.user.id) {
    return { error: err("FORBIDDEN", "Only the creator or an owner/admin can delete this habit") };
  }
  const { error } = await supabase.from("habits").delete().eq("id", habitId).eq("household_id", ctx.householdId);
  if (error) return { error: err("DB", error.message) };
  return { error: null };
}

/** Set (or clear with 0/null) your own check-in for a date. */
export async function setHabitCheckin(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  habitId: string,
  input: HabitCheckinInput,
): Promise<{ error: ServiceError | null }> {
  if (!canWrite(ctx.role)) return { error: err("FORBIDDEN", "Viewers cannot check in") };
  const existing = await loadHabit(supabase, ctx, habitId);
  if (existing.error || !existing.data) return { error: existing.error };
  const habit = existing.data;

  if (habit.owner_member_id && habit.owner_member_id !== ctx.membershipId) {
    return { error: err("FORBIDDEN", "This habit belongs to your partner") };
  }
  const { today } = await getHouseholdToday(supabase, ctx);
  if (!canCheckIn(input.date, today) || input.date < habit.start_date) {
    return { error: err("VALIDATION", "You can check in for today and the last 7 days") };
  }

  if (!input.value) {
    const { error } = await supabase
      .from("habit_checkins")
      .delete()
      .eq("household_id", ctx.householdId)
      .eq("habit_id", habitId)
      .eq("member_id", ctx.membershipId)
      .eq("checkin_date", input.date);
    if (error) return { error: err("DB", error.message) };
    return { error: null };
  }

  const value = habit.goal_kind === "check" ? 1 : roundAmount(input.value);
  const { error } = await supabase.from("habit_checkins").upsert(
    {
      habit_id: habitId,
      household_id: ctx.householdId,
      member_id: ctx.membershipId,
      checkin_date: input.date,
      value,
    },
    { onConflict: "habit_id,member_id,checkin_date" },
  );
  if (error) return { error: err("DB", error.message) };
  return { error: null };
}
