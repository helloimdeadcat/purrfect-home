import type { HabitFrequency, HabitGoal, Streak } from "@/lib/calculations/habits";
import { WEEKDAY_SHORT } from "@/lib/tasks/describe";

export function describeFrequency(frequency: HabitFrequency): string {
  switch (frequency.kind) {
    case "daily":
      return "Every day";
    case "days": {
      const days = [...frequency.weekdays].sort();
      if (days.join() === "1,2,3,4,5") return "Weekdays";
      if (days.join() === "6,7") return "Weekends";
      if (days.length === 7) return "Every day";
      return days.map((d) => WEEKDAY_SHORT[d - 1]).join(", ");
    }
    case "per_week":
      return frequency.times === 1 ? "Once a week" : `${frequency.times}× a week`;
  }
}

/** 2 → "2", 1.5 → "1.5", 0.25 → "0.25" */
export function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function describeGoal(goal: HabitGoal): string | null {
  if (goal.kind === "check") return null;
  return `${formatAmount(goal.target)}${goal.unit ? ` ${goal.unit}` : ""} a day`;
}

export function describeStreak(streak: Streak): string {
  if (streak.count === 0) return "No streak yet";
  const unit = streak.unit === "days" ? (streak.count === 1 ? "day" : "days") : streak.count === 1 ? "week" : "weeks";
  return `${streak.count} ${unit} in a row`;
}

/** Step for the +/− buttons: whole units for whole targets, else quarters. */
export function amountStep(goal: HabitGoal): number {
  if (goal.kind === "check") return 1;
  return Number.isInteger(goal.target) ? 1 : 0.25;
}
