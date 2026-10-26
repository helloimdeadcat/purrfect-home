/**
 * Repeat rules and agenda building for shared to-dos and schedule events.
 * Pure date math on YYYY-MM-DD strings (UTC calendar arithmetic; "today"
 * must already be the household-local date).
 */

export type TaskRepeat =
  | { kind: "none" }
  /** Every `interval` days. */
  | { kind: "daily"; interval: number }
  /** On the given ISO weekdays (1 = Mon … 7 = Sun), every `interval` weeks. */
  | { kind: "weekly"; interval: number; weekdays: number[] }
  /** On `dayOfMonth` (clamped to month end), every `interval` months. */
  | { kind: "monthly"; interval: number; dayOfMonth: number };

export type SchedulableTask = {
  /** Required for repeating tasks; null = undated one-off ("someday"). */
  startDate: string | null;
  repeat: TaskRepeat;
  repeatUntil?: string | null;
};

const DAY_MS = 86_400_000;
/** Safety bound for any expansion loop (callers keep ranges ≤ ~1 year). */
const MAX_STEPS = 5_000;

function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: string): number {
  const day = new Date(toUtc(iso)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday of the ISO week containing `iso`. */
export function weekStart(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso));
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/**
 * All dates in [from, to] (inclusive) on which the task occurs.
 * One-offs yield their start date when it falls in range; undated tasks
 * yield nothing (they are listed separately).
 */
export function expandOccurrences(task: SchedulableTask, from: string, to: string): string[] {
  if (!task.startDate || to < from) return [];
  const start = task.startDate;
  const until = task.repeatUntil && task.repeatUntil < to ? task.repeatUntil : to;
  const lower = start > from ? start : from;
  if (until < lower) return [];

  const repeat = task.repeat;
  const dates: string[] = [];

  switch (repeat.kind) {
    case "none":
      return start >= from && start <= to ? [start] : [];

    case "daily": {
      const step = Math.max(1, repeat.interval);
      const offset = daysBetween(start, lower);
      let cursor = addDays(start, Math.ceil(offset / step) * step);
      for (let i = 0; cursor <= until && i < MAX_STEPS; i += 1) {
        dates.push(cursor);
        cursor = addDays(cursor, step);
      }
      return dates;
    }

    case "weekly": {
      const step = Math.max(1, repeat.interval);
      const days = new Set(repeat.weekdays.filter((d) => d >= 1 && d <= 7));
      if (days.size === 0) return [];
      const anchorWeek = weekStart(start);
      let cursor = lower;
      for (let i = 0; cursor <= until && i < MAX_STEPS; i += 1) {
        const weekIndex = daysBetween(anchorWeek, weekStart(cursor)) / 7;
        if (weekIndex % step === 0 && days.has(isoWeekday(cursor))) {
          dates.push(cursor);
        }
        cursor = addDays(cursor, 1);
      }
      return dates;
    }

    case "monthly": {
      const step = Math.max(1, repeat.interval);
      const [sy, sm] = start.split("-").map(Number);
      for (let k = 0; k < MAX_STEPS; k += step) {
        const monthIndex = sm - 1 + k;
        const year = sy + Math.floor(monthIndex / 12);
        const month1 = (monthIndex % 12) + 1;
        const day = Math.min(repeat.dayOfMonth, daysInMonth(year, month1));
        const date = `${year}-${String(month1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (date > until) break;
        if (date >= lower && date >= start) dates.push(date);
      }
      return dates;
    }
  }
}

export function isRepeating(repeat: TaskRepeat): boolean {
  return repeat.kind !== "none";
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

export type AgendaTask = SchedulableTask & {
  id: string;
  title: string;
  kind: "task" | "event";
  startTime: string | null;
  endTime: string | null;
  assigneeMemberId: string | null;
  /** Non-repeating tasks only: when it was ticked off. */
  completedAt: string | null;
};

export type AgendaItem = {
  /** Stable per occurrence: `${taskId}:${date}` or `${taskId}:someday`. */
  key: string;
  taskId: string;
  date: string | null;
  title: string;
  kind: "task" | "event";
  startTime: string | null;
  endTime: string | null;
  assigneeMemberId: string | null;
  repeating: boolean;
  done: boolean;
  /** A dated one-off before today that is still open. */
  overdue: boolean;
};

export type Agenda = {
  /** Open one-offs dated before `from` — never silently dropped. */
  overdue: AgendaItem[];
  /** Occurrences in [from, to], grouped by date, timed items first by time. */
  byDate: Record<string, AgendaItem[]>;
  /** Undated one-offs ("someday"). */
  someday: AgendaItem[];
};

function compareItems(a: AgendaItem, b: AgendaItem): number {
  if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
  if (a.startTime) return -1;
  if (b.startTime) return 1;
  return a.title.localeCompare(b.title);
}

/**
 * Expand tasks into a dated agenda. `completions` holds the occurrence dates
 * ticked off for repeating tasks (taskId → set of dates). Missed occurrences
 * of repeating tasks are not carried over — only one-offs become overdue.
 */
export function buildAgenda(input: {
  tasks: AgendaTask[];
  completions: Map<string, Set<string>>;
  from: string;
  to: string;
  today: string;
}): Agenda {
  const { tasks, completions, from, to, today } = input;
  const agenda: Agenda = { overdue: [], byDate: {}, someday: [] };

  for (const task of tasks) {
    const base = {
      taskId: task.id,
      title: task.title,
      kind: task.kind,
      startTime: task.startTime,
      endTime: task.endTime,
      assigneeMemberId: task.assigneeMemberId,
      repeating: isRepeating(task.repeat),
    };

    if (!task.startDate) {
      agenda.someday.push({
        ...base,
        key: `${task.id}:someday`,
        date: null,
        done: task.completedAt !== null,
        overdue: false,
      });
      continue;
    }

    if (!base.repeating && task.startDate < from) {
      if (task.completedAt === null && task.startDate < today) {
        agenda.overdue.push({ ...base, key: `${task.id}:${task.startDate}`, date: task.startDate, done: false, overdue: true });
      }
      continue;
    }

    const doneDates = completions.get(task.id);
    for (const date of expandOccurrences(task, from, to)) {
      const done = base.repeating ? (doneDates?.has(date) ?? false) : task.completedAt !== null;
      const item: AgendaItem = {
        ...base,
        key: `${task.id}:${date}`,
        date,
        done,
        overdue: !base.repeating && !done && date < today,
      };
      (agenda.byDate[date] ??= []).push(item);
    }
  }

  for (const list of Object.values(agenda.byDate)) list.sort(compareItems);
  agenda.overdue.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  agenda.someday.sort((a, b) => Number(a.done) - Number(b.done) || a.title.localeCompare(b.title));
  return agenda;
}
