"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEEKDAY_SHORT } from "@/lib/tasks/describe";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type PersonOption = { memberId: string | null; label: string; color: string };

type RepeatChoice = "none" | "daily" | "weekdays" | "weekly" | "monthly";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function initialRepeatChoice(task?: TaskRow): RepeatChoice {
  if (!task || task.repeat_kind === "none") return "none";
  if (task.repeat_kind === "weekly" && task.repeat_interval === 1 && (task.repeat_weekdays ?? []).join() === "1,2,3,4,5") {
    return "weekdays";
  }
  return task.repeat_kind;
}

/** ISO weekday (1–7) of a YYYY-MM-DD date. */
function isoDay(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function TaskForm({
  people,
  defaultDate,
  defaultAssignee = null,
  task,
  onDone,
}: {
  people: PersonOption[];
  defaultDate: string | null;
  defaultAssignee?: string | null;
  /** Present when editing. */
  task?: TaskRow;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<RepeatChoice>(initialRepeatChoice(task));
  const [weekdays, setWeekdays] = useState<number[]>(
    task?.repeat_weekdays ?? (defaultDate ? [isoDay(defaultDate)] : [1]),
  );
  const [hasTime, setHasTime] = useState(Boolean(task?.start_time));

  function toggleDay(day: number) {
    setWeekdays((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort(),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    // currentTarget is cleared once we await; keep the element for reset().
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const startDate = String(form.get("startDate") ?? "") || null;
    const interval = Number(form.get("interval") ?? 1) || 1;
    const dayOfMonth = Number(form.get("dayOfMonth") ?? 0) || (startDate ? Number(startDate.slice(8, 10)) : 1);

    const repeatPayload =
      repeat === "none"
        ? { kind: "none" }
        : repeat === "daily"
          ? { kind: "daily", interval }
          : repeat === "weekdays"
            ? { kind: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5] }
            : repeat === "weekly"
              ? { kind: "weekly", interval, weekdays }
              : { kind: "monthly", interval, dayOfMonth };

    const assigneeRaw = String(form.get("assignee") ?? "");
    const payload = {
      title: String(form.get("title") ?? ""),
      notes: String(form.get("notes") ?? "") || null,
      assigneeMemberId: assigneeRaw || null,
      startDate,
      startTime: hasTime ? String(form.get("startTime") ?? "") || null : null,
      endTime: hasTime ? String(form.get("endTime") ?? "") || null : null,
      repeat: repeatPayload,
      repeatUntil: repeat === "none" ? null : String(form.get("repeatUntil") ?? "") || null,
    };

    setPending(true);
    try {
      const response = await fetch(task ? `/api/tasks/${task.id}` : "/api/tasks", {
        method: task ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
      };
      if (!response.ok) {
        const fieldMessage = data.details?.fieldErrors
          ? Object.values(data.details.fieldErrors).flat()[0]
          : data.details?.formErrors?.[0];
        setError(fieldMessage ?? data.error ?? "Could not save");
        return;
      }
      if (!task) formEl.reset();
      router.refresh();
      onDone?.();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  const showInterval = repeat === "daily" || repeat === "weekly" || repeat === "monthly";
  const unit = repeat === "daily" ? "days" : repeat === "weekly" ? "weeks" : "months";

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`title-${task?.id ?? "new"}`}>What</Label>
        <Input
          id={`title-${task?.id ?? "new"}`}
          name="title"
          required
          maxLength={200}
          defaultValue={task?.title}
          placeholder="Feed the cat, gym, call grandma…"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`who-${task?.id ?? "new"}`}>Who</Label>
          <select
            id={`who-${task?.id ?? "new"}`}
            name="assignee"
            defaultValue={task ? (task.assignee_member_id ?? "") : (defaultAssignee ?? "")}
            className={SELECT_CLASS}
          >
            {people.map((person) => (
              <option key={person.memberId ?? "together"} value={person.memberId ?? ""}>
                {person.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`date-${task?.id ?? "new"}`}>
            {repeat === "none" ? "Date (optional)" : "Starting"}
          </Label>
          <Input
            id={`date-${task?.id ?? "new"}`}
            name="startDate"
            type="date"
            required={repeat !== "none" || hasTime}
            defaultValue={task ? (task.start_date ?? "") : (defaultDate ?? "")}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={hasTime} onChange={(e) => setHasTime(e.target.checked)} />
        At a specific time (shows in the schedule)
      </label>
      {hasTime ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`start-${task?.id ?? "new"}`}>From</Label>
            <Input
              id={`start-${task?.id ?? "new"}`}
              name="startTime"
              type="time"
              required
              defaultValue={task?.start_time?.slice(0, 5) ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`end-${task?.id ?? "new"}`}>Until (optional)</Label>
            <Input
              id={`end-${task?.id ?? "new"}`}
              name="endTime"
              type="time"
              defaultValue={task?.end_time?.slice(0, 5) ?? ""}
            />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`repeat-${task?.id ?? "new"}`}>Repeat</Label>
          <select
            id={`repeat-${task?.id ?? "new"}`}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as RepeatChoice)}
            className={SELECT_CLASS}
          >
            <option value="none">Doesn&apos;t repeat</option>
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays (Mon–Fri)</option>
            <option value="weekly">Weekly on…</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        {showInterval ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`interval-${task?.id ?? "new"}`}>Every</Label>
            <div className="flex items-center gap-2">
              <Input
                id={`interval-${task?.id ?? "new"}`}
                name="interval"
                type="number"
                min={1}
                max={repeat === "monthly" ? 12 : 52}
                defaultValue={task?.repeat_interval ?? 1}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
          </div>
        ) : null}
      </div>

      {repeat === "weekly" ? (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-sm font-medium">On</legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_SHORT.map((label, index) => {
              const day = index + 1;
              const on = weekdays.includes(day);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "h-8 min-w-11 rounded-full border px-3 text-sm transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-secondary",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {repeat === "monthly" ? (
        <div className="grid gap-1.5 sm:w-1/2">
          <Label htmlFor={`dom-${task?.id ?? "new"}`}>On day</Label>
          <Input
            id={`dom-${task?.id ?? "new"}`}
            name="dayOfMonth"
            type="number"
            min={1}
            max={31}
            defaultValue={task?.repeat_day_of_month ?? (defaultDate ? Number(defaultDate.slice(8, 10)) : 1)}
          />
          <p className="text-xs text-muted-foreground">Short months use their last day.</p>
        </div>
      ) : null}

      {repeat !== "none" ? (
        <div className="grid gap-1.5 sm:w-1/2">
          <Label htmlFor={`until-${task?.id ?? "new"}`}>End date (optional)</Label>
          <Input
            id={`until-${task?.id ?? "new"}`}
            name="repeatUntil"
            type="date"
            defaultValue={task?.repeat_until ?? ""}
          />
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor={`notes-${task?.id ?? "new"}`}>Notes (optional)</Label>
        <Input
          id={`notes-${task?.id ?? "new"}`}
          name="notes"
          maxLength={2000}
          defaultValue={task?.notes ?? ""}
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : task ? "Save" : "Add"}
        </Button>
        {onDone && task ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
