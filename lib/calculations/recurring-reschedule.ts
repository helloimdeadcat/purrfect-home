import {
  listRecurringDatesInRange,
  type RecurringScheduleTemplate,
} from "@/lib/calculations/recurring-dates";
import { addDaysIso } from "@/lib/calculations/timezone-date";

/** How far ahead to look for the next date of an edited schedule. */
const LOOKAHEAD_DAYS = 800;

/**
 * Decide what a schedule edit means for already-materialised occurrences.
 *
 * Only future, unprocessed occurrences whose date is NOT part of the new
 * schedule are superseded — one that still matches (e.g. the user only
 * changed the end date) stays pending. Without this, superseding it and then
 * "finding" the same, now-skipped row as the next occurrence would make the
 * payment vanish from forecast and calendar.
 */
export function planReschedule(input: {
  template: RecurringScheduleTemplate;
  today: string;
  /** Pending occurrences dated today or later, without a transaction. */
  futurePending: { id: string; scheduled_date: string }[];
  /**
   * Future occurrences an earlier edit superseded. Ones that are back on the
   * schedule (edit 1st → 15th → 1st) must be revived, otherwise the skipped
   * row would block that date for good.
   */
  futureSuperseded?: { id: string; scheduled_date: string }[];
}): { supersedeIds: string[]; reviveIds: string[]; nextDue: string | null } {
  const { template, today, futurePending } = input;
  const futureSuperseded = input.futureSuperseded ?? [];
  const from = today > template.startDate ? today : template.startDate;
  const latestPending = [...futurePending, ...futureSuperseded].reduce(
    (max, occ) => (occ.scheduled_date > max ? occ.scheduled_date : max),
    from,
  );
  const lookaheadEnd = addDaysIso(today, LOOKAHEAD_DAYS);
  const until = latestPending > lookaheadEnd ? latestPending : lookaheadEnd;

  const validDates = listRecurringDatesInRange(template, from, until);
  const valid = new Set(validDates);

  return {
    supersedeIds: futurePending
      .filter((occ) => !valid.has(occ.scheduled_date))
      .map((occ) => occ.id),
    reviveIds: futureSuperseded
      .filter((occ) => valid.has(occ.scheduled_date))
      .map((occ) => occ.id),
    nextDue: validDates[0] ?? null,
  };
}

type ScheduleFields = {
  frequency: string;
  interval_days: number | null;
  day_of_month: number | null;
  weekday: number | null;
  end_date: string | null;
};

/**
 * True only when an edit actually changes the schedule. Forms resend every
 * field, so presence alone (e.g. a rename) must not trigger rescheduling.
 */
export function scheduleActuallyChanged(
  existing: ScheduleFields,
  input: {
    frequency?: string;
    intervalDays?: number | null;
    dayOfMonth?: number | null;
    weekday?: number | null;
    endDate?: string | null;
  },
): boolean {
  const differs = <T>(next: T | undefined, current: T | null) =>
    next !== undefined && (next ?? null) !== current;
  const nextFrequency = input.frequency ?? existing.frequency;
  return (
    differs(input.frequency, existing.frequency) ||
    (nextFrequency === "custom" && differs(input.intervalDays, existing.interval_days)) ||
    differs(input.dayOfMonth, existing.day_of_month) ||
    differs(input.weekday, existing.weekday) ||
    differs(input.endDate, existing.end_date)
  );
}
