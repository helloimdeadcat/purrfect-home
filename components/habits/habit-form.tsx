"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEEKDAY_SHORT } from "@/lib/tasks/describe";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type HabitRow = Database["public"]["Tables"]["habits"]["Row"];
type PersonOption = { memberId: string | null; label: string };

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function HabitForm({
  people,
  defaultOwner,
  habit,
  onDone,
}: {
  people: PersonOption[];
  defaultOwner: string | null;
  habit?: HabitRow;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [goalKind, setGoalKind] = useState<"check" | "count">(habit?.goal_kind ?? "check");
  const [frequency, setFrequency] = useState<"daily" | "days" | "per_week">(habit?.frequency ?? "daily");
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? [1, 3, 5]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = habit?.id ?? "new";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const ownerRaw = String(form.get("owner") ?? "");
    const payload = {
      title: String(form.get("title") ?? ""),
      emoji: String(form.get("emoji") ?? "") || null,
      ownerMemberId: ownerRaw || null,
      goal:
        goalKind === "check"
          ? { kind: "check" }
          : {
              kind: "count",
              target: Number(String(form.get("target") ?? "").replace(",", ".")),
              unit: String(form.get("unit") ?? "") || null,
            },
      frequency:
        frequency === "daily"
          ? { kind: "daily" }
          : frequency === "days"
            ? { kind: "days", weekdays }
            : { kind: "per_week", times: Number(form.get("times") ?? 3) },
    };

    setPending(true);
    try {
      const response = await fetch(habit ? `/api/habits/${habit.id}` : "/api/habits", {
        method: habit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        details?: { fieldErrors?: Record<string, string[]> };
      };
      if (!response.ok) {
        const fieldMessage = data.details?.fieldErrors
          ? Object.values(data.details.fieldErrors).flat()[0]
          : null;
        setError(fieldMessage ?? data.error ?? "Не получилось сохранить");
        return;
      }
      if (!habit) formEl.reset();
      router.refresh();
      onDone?.();
    } catch {
      setError("Ошибка сети — проверь подключение");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid grid-cols-[4.5rem_1fr] gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`emoji-${id}`}>Значок</Label>
          <Input id={`emoji-${id}`} name="emoji" maxLength={8} defaultValue={habit?.emoji ?? ""} placeholder="💧" className="text-center" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`habit-${id}`}>Привычка</Label>
          <Input id={`habit-${id}`} name="title" required maxLength={120} defaultValue={habit?.title} placeholder="Пить воду, гулять, читать…" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`owner-${id}`}>Для кого</Label>
          <select
            id={`owner-${id}`}
            name="owner"
            defaultValue={habit ? (habit.owner_member_id ?? "") : (defaultOwner ?? "")}
            className={SELECT_CLASS}
          >
            {people.map((p) => (
              <option key={p.memberId ?? "both"} value={p.memberId ?? ""}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`goal-${id}`}>Цель</Label>
          <select
            id={`goal-${id}`}
            value={goalKind}
            onChange={(e) => setGoalKind(e.target.value as "check" | "count")}
            className={SELECT_CLASS}
          >
            <option value="check">Просто сделать (галочка)</option>
            <option value="count">Набрать количество</option>
          </select>
        </div>
      </div>

      {goalKind === "count" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`target-${id}`}>Цель на день</Label>
            <Input
              id={`target-${id}`}
              name="target"
              inputMode="decimal"
              required
              defaultValue={habit?.goal_kind === "count" ? String(Number(habit.target)) : ""}
              placeholder="2"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`unit-${id}`}>Единица</Label>
            <Input id={`unit-${id}`} name="unit" maxLength={20} defaultValue={habit?.unit ?? ""} placeholder="л, стаканы, шаги" />
          </div>
        </div>
      ) : null}

      <div className="grid gap-1.5 sm:w-1/2">
        <Label htmlFor={`freq-${id}`}>Как часто</Label>
        <select
          id={`freq-${id}`}
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as typeof frequency)}
          className={SELECT_CLASS}
        >
          <option value="daily">Каждый день</option>
          <option value="days">В определённые дни</option>
          <option value="per_week">Несколько раз в неделю</option>
        </select>
      </div>

      {frequency === "days" ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Дни">
          {WEEKDAY_SHORT.map((label, index) => {
            const day = index + 1;
            const on = weekdays.includes(day);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setWeekdays((days) => (on ? days.filter((d) => d !== day) : [...days, day].sort()))
                }
                className={cn(
                  "h-8 min-w-11 rounded-full border px-3 text-sm transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {frequency === "per_week" ? (
        <div className="flex items-center gap-2">
          <Input
            id={`times-${id}`}
            name="times"
            type="number"
            min={1}
            max={7}
            defaultValue={habit?.times_per_week ?? 3}
            className="w-20"
            aria-label="Раз в неделю"
          />
          <span className="text-sm text-muted-foreground">раз в неделю, в любые дни</span>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняю…" : habit ? "Сохранить" : "Добавить привычку"}
        </Button>
        {habit && onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Отмена
          </Button>
        ) : null}
      </div>
    </form>
  );
}
