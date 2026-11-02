import {
  addDaysIso,
  monthEndFromDateIso,
} from "@/lib/calculations/timezone-date";

export type ForecastHorizonPreset =
  | "end_of_month"
  | "next_7_days"
  | "next_30_days"
  | "custom";

export type ForecastDateRange = {
  start: string;
  end: string;
};

const MAX_HORIZON_DAYS = 366;

function parseUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function daysInclusive(start: string, end: string): number {
  const ms = parseUtc(end).getTime() - parseUtc(start).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

/**
 * Resolve forecast horizon as inclusive [today, end].
 * `today` must already be the household-local calendar date.
 */
export function resolveForecastHorizon(
  preset: ForecastHorizonPreset,
  options: {
    today: string;
    from?: string | null;
    to?: string | null;
  },
): ForecastDateRange {
  const today = options.today;

  switch (preset) {
    case "end_of_month":
      return { start: today, end: monthEndFromDateIso(today) };
    case "next_7_days":
      return { start: today, end: addDaysIso(today, 6) };
    case "next_30_days":
      return { start: today, end: addDaysIso(today, 29) };
    case "custom": {
      const from = options.from ?? today;
      const to = options.to;
      if (!to) {
        throw new Error("Для своего горизонта укажи конечную дату");
      }
      if (to < today) {
        throw new Error("Конец прогноза не может быть раньше сегодняшнего дня");
      }
      if (from > to) {
        throw new Error("Начало прогноза не может быть позже его конца");
      }
      // Forecast always starts at today for Safe-to-Spend / balance projection.
      const start = from < today ? today : from;
      // The projection itself runs from today, so cap the span from today —
      // a late `from` must not smuggle in a longer horizon.
      if (daysInclusive(today, to) > MAX_HORIZON_DAYS) {
        throw new Error(`Прогноз не может быть длиннее ${MAX_HORIZON_DAYS} дней`);
      }
      return { start, end: to };
    }
    default: {
      const _exhaustive: never = preset;
      throw new Error(`Unsupported horizon: ${_exhaustive}`);
    }
  }
}
