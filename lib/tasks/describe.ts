import type { TaskRepeat } from "@/lib/calculations/task-schedule";

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${suffix}`;
}

/** Short human label: "Every day", "Weekdays", "Every 2 weeks · Tue, Thu", "Monthly on the 31st". */
export function describeRepeat(repeat: TaskRepeat): string | null {
  switch (repeat.kind) {
    case "none":
      return null;
    case "daily":
      return repeat.interval === 1 ? "Every day" : `Every ${repeat.interval} days`;
    case "weekly": {
      const days = [...repeat.weekdays].sort();
      const isWeekdays = days.join() === "1,2,3,4,5";
      const isEveryDay = days.length === 7;
      const prefix = repeat.interval === 1 ? "Weekly" : `Every ${repeat.interval} weeks`;
      if (repeat.interval === 1 && isWeekdays) return "Weekdays";
      if (repeat.interval === 1 && isEveryDay) return "Every day";
      return `${prefix} · ${days.map((d) => WEEKDAY_SHORT[d - 1]).join(", ")}`;
    }
    case "monthly":
      return repeat.interval === 1
        ? `Monthly on the ${ordinal(repeat.dayOfMonth)}`
        : `Every ${repeat.interval} months on the ${ordinal(repeat.dayOfMonth)}`;
  }
}

/** "19:00–20:30", "19:00" or null. */
export function describeTime(start: string | null, end: string | null): string | null {
  if (!start) return null;
  return end ? `${start}–${end}` : start;
}
