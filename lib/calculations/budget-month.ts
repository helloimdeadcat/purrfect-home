/** Calendar helpers for monthly budgets (UTC date boundaries). */

export function monthStartIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function monthEndIso(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

export function parseYearMonth(
  value: string | null | undefined,
  fallback = new Date(),
): { year: number; month: number } {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      return { year: y, month: m };
    }
  }
  return {
    year: fallback.getUTCFullYear(),
    month: fallback.getUTCMonth() + 1,
  };
}

/** UTC-midnight Date for a YYYY-MM-DD day — use as parseYearMonth fallback. */
export function dateFromIsoDay(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftYearMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}
