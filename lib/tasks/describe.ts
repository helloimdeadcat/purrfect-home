import type { TaskRepeat } from "@/lib/calculations/task-schedule";

export const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

const pluralRules = new Intl.PluralRules("ru-RU");

/** Russian plural form: pluralRu(3, "день", "дня", "дней") → "дня". Fractions use the "few" form. */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  switch (pluralRules.select(n)) {
    case "one":
      return one;
    case "many":
      return many;
    default:
      return few;
  }
}

/** Short human label: "Каждый день", "По будням", "Раз в 2 недели · Вт, Чт", "Каждый месяц, 31-го". */
export function describeRepeat(repeat: TaskRepeat): string | null {
  switch (repeat.kind) {
    case "none":
      return null;
    case "daily":
      return repeat.interval === 1
        ? "Каждый день"
        : `Раз в ${repeat.interval} ${pluralRu(repeat.interval, "день", "дня", "дней")}`;
    case "weekly": {
      const days = [...repeat.weekdays].sort();
      const isWeekdays = days.join() === "1,2,3,4,5";
      const isEveryDay = days.length === 7;
      const prefix =
        repeat.interval === 1
          ? "Каждую неделю"
          : `Раз в ${repeat.interval} ${pluralRu(repeat.interval, "неделю", "недели", "недель")}`;
      if (repeat.interval === 1 && isWeekdays) return "По будням";
      if (repeat.interval === 1 && isEveryDay) return "Каждый день";
      return `${prefix} · ${days.map((d) => WEEKDAY_SHORT[d - 1]).join(", ")}`;
    }
    case "monthly":
      return repeat.interval === 1
        ? `Каждый месяц, ${repeat.dayOfMonth}-го`
        : `Раз в ${repeat.interval} ${pluralRu(repeat.interval, "месяц", "месяца", "месяцев")}, ${repeat.dayOfMonth}-го`;
  }
}

/** "19:00–20:30", "19:00" or null. */
export function describeTime(start: string | null, end: string | null): string | null {
  if (!start) return null;
  return end ? `${start}–${end}` : start;
}
