import type { HabitFrequency, HabitGoal, Streak } from "@/lib/calculations/habits";
import { pluralRu, WEEKDAY_SHORT } from "@/lib/tasks/describe";

export function describeFrequency(frequency: HabitFrequency): string {
  switch (frequency.kind) {
    case "daily":
      return "Каждый день";
    case "days": {
      const days = [...frequency.weekdays].sort();
      if (days.join() === "1,2,3,4,5") return "По будням";
      if (days.join() === "6,7") return "По выходным";
      if (days.length === 7) return "Каждый день";
      return days.map((d) => WEEKDAY_SHORT[d - 1]).join(", ");
    }
    case "per_week":
      return frequency.times === 1
        ? "Раз в неделю"
        : `${frequency.times} ${pluralRu(frequency.times, "раз", "раза", "раз")} в неделю`;
  }
}

/** 2 → "2", 1.5 → "1.5", 0.25 → "0.25" */
export function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function describeGoal(goal: HabitGoal): string | null {
  if (goal.kind === "check") return null;
  return `${formatAmount(goal.target)}${goal.unit ? ` ${goal.unit}` : ""} в день`;
}

export function describeStreak(streak: Streak): string {
  if (streak.count === 0) return "Серии пока нет";
  const unit =
    streak.unit === "days"
      ? pluralRu(streak.count, "день", "дня", "дней")
      : pluralRu(streak.count, "неделя", "недели", "недель");
  return `${streak.count} ${unit} подряд`;
}

/** Step for the +/− buttons: whole units for whole targets, else quarters. */
export function amountStep(goal: HabitGoal): number {
  if (goal.kind === "check") return 1;
  return Number.isInteger(goal.target) ? 1 : 0.25;
}
