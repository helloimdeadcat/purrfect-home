import type { RecurrenceFrequency } from "@/types/database";

export type NextDueInput = {
  from: string; // YYYY-MM-DD
  frequency: RecurrenceFrequency;
  intervalDays?: number | null;
  dayOfMonth?: number | null;
  weekday?: number | null;
};

function parseUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Compute the next due date after `from` (exclusive of regenerating same day).
 * Mirrors public.compute_next_recurring_due_date in SQL.
 */
export function computeNextDueDate(input: NextDueInput): string {
  const from = parseUtcDate(input.from);

  switch (input.frequency) {
    case "daily": {
      from.setUTCDate(from.getUTCDate() + 1);
      return formatUtcDate(from);
    }
    case "weekly": {
      from.setUTCDate(from.getUTCDate() + 7);
      return formatUtcDate(from);
    }
    case "yearly": {
      // Same month next year, anchored on dayOfMonth and clamped to month
      // end: 2028-02-29 → 2029-02-28 → … → 2032-02-29. Must match SQL.
      const nextYear = from.getUTCFullYear() + 1;
      const monthIndex = from.getUTCMonth();
      const preferredDom = input.dayOfMonth ?? from.getUTCDate();
      const dom = Math.min(preferredDom, daysInMonth(nextYear, monthIndex));
      return formatUtcDate(new Date(Date.UTC(nextYear, monthIndex, dom)));
    }
    case "custom": {
      const days = input.intervalDays ?? 0;
      if (days < 1) {
        throw new Error("intervalDays is required for custom frequency");
      }
      from.setUTCDate(from.getUTCDate() + days);
      return formatUtcDate(from);
    }
    case "monthly": {
      const year = from.getUTCFullYear();
      const month = from.getUTCMonth();
      const preferredDom =
        input.dayOfMonth ?? from.getUTCDate();
      const nextMonth = month + 1;
      const nextYear = year + Math.floor(nextMonth / 12);
      const nextMonthIndex = ((nextMonth % 12) + 12) % 12;
      const dom = Math.min(preferredDom, daysInMonth(nextYear, nextMonthIndex));
      return formatUtcDate(new Date(Date.UTC(nextYear, nextMonthIndex, dom)));
    }
    default: {
      const _exhaustive: never = input.frequency;
      throw new Error(`Unsupported frequency: ${_exhaustive}`);
    }
  }
}

export function isPastOrToday(isoDate: string, todayIso?: string): boolean {
  const today =
    todayIso ??
    formatUtcDate(new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    )));
  return isoDate <= today;
}

export function isPast(isoDate: string, todayIso?: string): boolean {
  const today =
    todayIso ??
    formatUtcDate(new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    )));
  return isoDate < today;
}

export function todayUtcIso(): string {
  const now = new Date();
  return formatUtcDate(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
  );
}

/** Whether a template should still schedule after this next date. */
export function isWithinEndDate(
  nextDue: string,
  endDate: string | null | undefined,
): boolean {
  if (!endDate) return true;
  return nextDue <= endDate;
}

export type RecurringScheduleTemplate = {
  startDate: string;
  endDate?: string | null;
  frequency: RecurrenceFrequency;
  intervalDays?: number | null;
  dayOfMonth?: number | null;
  weekday?: number | null;
};

/**
 * List scheduled dates for a recurring template within [rangeStart, rangeEnd]
 * (inclusive). Pure projection — does not write occurrences or transactions.
 */
export function listRecurringDatesInRange(
  template: RecurringScheduleTemplate,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  if (rangeEnd < rangeStart) return [];
  if (template.endDate && template.startDate > template.endDate) return [];

  const dates: string[] = [];
  let cursor = template.startDate;
  let guard = 0;

  // Walk forward from start until we enter the range (or pass it).
  while (cursor < rangeStart && guard < 10_000) {
    guard += 1;
    if (template.endDate && cursor > template.endDate) return dates;
    try {
      cursor = computeNextDueDate({
        from: cursor,
        frequency: template.frequency,
        intervalDays: template.intervalDays,
        dayOfMonth: template.dayOfMonth,
        weekday: template.weekday,
      });
    } catch {
      return dates;
    }
  }

  while (cursor <= rangeEnd && guard < 10_000) {
    guard += 1;
    if (template.endDate && cursor > template.endDate) break;
    if (cursor >= rangeStart) {
      dates.push(cursor);
    }
    try {
      cursor = computeNextDueDate({
        from: cursor,
        frequency: template.frequency,
        intervalDays: template.intervalDays,
        dayOfMonth: template.dayOfMonth,
        weekday: template.weekday,
      });
    } catch {
      break;
    }
  }

  return dates;
}
