import { todayUtcIso } from "@/lib/calculations/recurring-dates";

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

/**
 * Calendar date (YYYY-MM-DD) for `now` in the given IANA timezone.
 * Falls back to UTC calendar date if the timezone is invalid.
 */
export function todayInTimezone(
  timeZone: string,
  now: Date = new Date(),
): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // invalid IANA zone
  }
  return todayUtcIso();
}

export function addDaysIso(iso: string, days: number): string {
  const date = parseUtcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

export function monthEndFromDateIso(iso: string): string {
  const [y, m] = [Number(iso.slice(0, 4)), Number(iso.slice(5, 7))];
  const last = new Date(Date.UTC(y, m, 0));
  return formatUtcDate(last);
}

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
