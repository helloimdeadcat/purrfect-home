import {
  formatYearMonth,
  monthEndIso,
  monthStartIso,
  shiftYearMonth,
} from "@/lib/calculations/budget-month";
import { todayUtcIso } from "@/lib/calculations/recurring-dates";

export type AnalyticsPeriodPreset =
  | "current_month"
  | "previous_month"
  | "last_3_months"
  | "last_6_months"
  | "year"
  | "custom";

export type DateRange = {
  start: string;
  end: string;
};

const MAX_RANGE_DAYS = 366;

function parseUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysInclusive(start: string, end: string): number {
  const ms = parseUtc(end).getTime() - parseUtc(start).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

export function assertRangeWithinLimit(range: DateRange): void {
  if (range.end < range.start) {
    throw new Error("End date must be on or after start date");
  }
  if (daysInclusive(range.start, range.end) > MAX_RANGE_DAYS) {
    throw new Error(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }
}

export function resolveAnalyticsPeriod(
  preset: AnalyticsPeriodPreset,
  options?: {
    from?: string | null;
    to?: string | null;
    today?: string;
  },
): DateRange {
  const today = options?.today ?? todayUtcIso();
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];

  switch (preset) {
    case "current_month":
      return { start: monthStartIso(ty, tm), end: today };
    case "previous_month": {
      const prev = shiftYearMonth(ty, tm, -1);
      return {
        start: monthStartIso(prev.year, prev.month),
        end: monthEndIso(prev.year, prev.month),
      };
    }
    case "last_3_months": {
      const startMonth = shiftYearMonth(ty, tm, -2);
      return {
        start: monthStartIso(startMonth.year, startMonth.month),
        end: today,
      };
    }
    case "last_6_months": {
      const startMonth = shiftYearMonth(ty, tm, -5);
      return {
        start: monthStartIso(startMonth.year, startMonth.month),
        end: today,
      };
    }
    case "year":
      return { start: `${ty}-01-01`, end: today };
    case "custom": {
      const from = options?.from;
      const to = options?.to;
      if (!from || !to) {
        throw new Error("Custom period requires from and to dates");
      }
      const range = { start: from, end: to };
      assertRangeWithinLimit(range);
      return range;
    }
    default: {
      const _exhaustive: never = preset;
      throw new Error(`Unknown period: ${_exhaustive}`);
    }
  }
}

/** Previous window of the same length ending the day before current.start. */
export function previousComparablePeriod(range: DateRange): DateRange {
  const length = daysInclusive(range.start, range.end);
  const end = formatUtc(
    new Date(parseUtc(range.start).getTime() - 86_400_000),
  );
  const start = formatUtc(
    new Date(parseUtc(end).getTime() - (length - 1) * 86_400_000),
  );
  return { start, end };
}

export function listMonthKeysInRange(range: DateRange): string[] {
  const keys: string[] = [];
  let y = Number(range.start.slice(0, 4));
  let m = Number(range.start.slice(5, 7));
  const endKey = formatYearMonth(
    Number(range.end.slice(0, 4)),
    Number(range.end.slice(5, 7)),
  );
  let guard = 0;
  while (guard < 24) {
    guard += 1;
    const key = formatYearMonth(y, m);
    keys.push(key);
    if (key >= endKey) break;
    const next = shiftYearMonth(y, m, 1);
    y = next.year;
    m = next.month;
  }
  return keys;
}

export function monthKeyFromDate(iso: string): string {
  return iso.slice(0, 7);
}
