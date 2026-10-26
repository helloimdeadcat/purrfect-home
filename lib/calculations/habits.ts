/**
 * Habit schedule, daily status and streak math. Pure functions over
 * YYYY-MM-DD strings; "today" must be the household-local date.
 */
import { addDays, daysBetween, isoWeekday, weekStart } from "@/lib/calculations/task-schedule";

export type HabitFrequency =
  | { kind: "daily" }
  /** Only on these ISO weekdays (1 = Mon … 7 = Sun). */
  | { kind: "days"; weekdays: number[] }
  /** Any days, `times` per ISO week. */
  | { kind: "per_week"; times: number };

export type HabitGoal =
  | { kind: "check" }
  /** Done when the day's total reaches `target` (e.g. 2 L, 8 glasses). */
  | { kind: "count"; target: number; unit: string | null };

export type HabitRules = {
  startDate: string;
  frequency: HabitFrequency;
  goal: HabitGoal;
};

/** Checked-in amount per date for one person (check habits store 1). */
export type CheckinMap = Map<string, number>;

export type DayStatus =
  /** Goal reached. */
  | "done"
  /** Some progress on a count habit, not yet the target. */
  | "partial"
  /** A scheduled day that passed without reaching the goal. */
  | "missed"
  /** Scheduled but still open (today). */
  | "open"
  /** Not a scheduled day, before the start, or in the future. */
  | "off";

/**
 * Round to the 2 decimals the database stores. The epsilon nudge fixes
 * binary float artefacts: 1.255 * 100 is 125.49999…, which must still
 * round half up to 1.26.
 */
export function roundAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function goalTarget(goal: HabitGoal): number {
  return goal.kind === "count" ? goal.target : 1;
}

export function isDone(goal: HabitGoal, value: number | undefined): boolean {
  return (value ?? 0) >= goalTarget(goal) - 1e-9;
}

/** Whether a specific date "counts" for this habit. per_week: every day can. */
export function isScheduled(rules: HabitRules, date: string): boolean {
  if (date < rules.startDate) return false;
  switch (rules.frequency.kind) {
    case "daily":
    case "per_week":
      return true;
    case "days":
      return rules.frequency.weekdays.includes(isoWeekday(date));
  }
}

export function dayStatus(
  rules: HabitRules,
  checkins: CheckinMap,
  date: string,
  today: string,
): DayStatus {
  if (date > today || date < rules.startDate) return "off";
  const value = checkins.get(date);
  if (isDone(rules.goal, value)) return "done";
  if ((value ?? 0) > 0) return "partial";
  if (!isScheduled(rules, date)) return "off";
  // per_week habits never "miss" a single day — only the weekly count matters.
  if (rules.frequency.kind === "per_week") return date === today ? "open" : "off";
  return date === today ? "open" : "missed";
}

/** Completions in the ISO week containing `date` (per_week habits). */
export function weekCount(rules: HabitRules, checkins: CheckinMap, date: string): number {
  const monday = weekStart(date);
  let count = 0;
  for (let i = 0; i < 7; i += 1) {
    const day = addDays(monday, i);
    if (day >= rules.startDate && isDone(rules.goal, checkins.get(day))) count += 1;
  }
  return count;
}

export type Streak = { count: number; unit: "days" | "weeks" };

/** Hard cap for streak scans (history is loaded for ~a year). */
const MAX_SCAN = 400;

/**
 * Current streak ending today. Today only extends the streak once done — an
 * unfinished today does not break it until the day is over.
 * - daily / days: consecutive scheduled days done (unscheduled days skipped);
 * - per_week: consecutive weeks reaching `times` (current week counts once met).
 */
export function currentStreak(rules: HabitRules, checkins: CheckinMap, today: string): Streak {
  if (rules.frequency.kind === "per_week") {
    const times = rules.frequency.times;
    let monday = weekStart(today);
    let count = 0;
    if (weekCount(rules, checkins, today) >= times) count += 1;
    for (let i = 0; i < MAX_SCAN / 7; i += 1) {
      monday = addDays(monday, -7);
      if (addDays(monday, 6) < rules.startDate) break;
      if (weekCount(rules, checkins, monday) >= times) count += 1;
      else break;
    }
    return { count, unit: "weeks" };
  }

  let count = 0;
  let day = today;
  for (let i = 0; i < MAX_SCAN && day >= rules.startDate; i += 1, day = addDays(day, -1)) {
    if (!isScheduled(rules, day)) continue;
    if (isDone(rules.goal, checkins.get(day))) {
      count += 1;
    } else if (day !== today) {
      break;
    }
  }
  return { count, unit: "days" };
}

/**
 * Share of scheduled days done in the last `days` days (including today only
 * if already done). per_week: weeks met over full weeks in the window.
 * Returns null when nothing was scheduled yet.
 */
export function completionRate(
  rules: HabitRules,
  checkins: CheckinMap,
  today: string,
  days = 30,
): number | null {
  if (rules.frequency.kind === "per_week") {
    const times = rules.frequency.times;
    let met = 0;
    let total = 0;
    let monday = addDays(weekStart(today), -7);
    for (let i = 0; i < Math.floor(days / 7); i += 1, monday = addDays(monday, -7)) {
      if (addDays(monday, 6) < rules.startDate) break;
      total += 1;
      if (weekCount(rules, checkins, monday) >= times) met += 1;
    }
    return total === 0 ? null : met / total;
  }

  let done = 0;
  let scheduled = 0;
  for (let i = 0; i < days; i += 1) {
    const day = addDays(today, -i);
    if (day < rules.startDate) break;
    if (!isScheduled(rules, day)) continue;
    const hit = isDone(rules.goal, checkins.get(day));
    if (day === today && !hit) continue; // still open
    scheduled += 1;
    if (hit) done += 1;
  }
  return scheduled === 0 ? null : done / scheduled;
}

/** Milestones that trigger a cheer for the partner (kept in sync with SQL). */
export const STREAK_MILESTONES = [7, 30, 100, 365] as const;

/** How many days back a person may fill in a missed check-in. */
export const BACKFILL_DAYS = 7;

export function canCheckIn(date: string, today: string): boolean {
  const back = daysBetween(date, today);
  return back >= 0 && back <= BACKFILL_DAYS;
}
