"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Heart } from "@/components/cute/illustrations";
import { HabitForm } from "@/components/habits/habit-form";
import { Button } from "@/components/ui/button";
import { roundAmount, type DayStatus, type HabitGoal } from "@/lib/calculations/habits";
import { amountStep, formatAmount } from "@/lib/habits/describe";
import { WEEKDAY_SHORT } from "@/lib/tasks/describe";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type HabitRow = Database["public"]["Tables"]["habits"]["Row"];

export type HabitCardParticipant = {
  memberId: string;
  label: string;
  color: string;
  isYou: boolean;
  strip: { date: string; status: DayStatus; value: number; canEdit: boolean }[];
  streakLabel: string;
  streakCount: number;
  rate30: number | null;
  thisWeek: number | null;
};

const STATUS_LABEL: Record<DayStatus, string> = {
  done: "готово",
  partial: "частично",
  missed: "пропущено",
  open: "ещё не отмечено",
  off: "выходной",
};

function weekdayInitial(date: string): string {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return WEEKDAY_SHORT[(d + 6) % 7].slice(0, 2);
}

function nextStatus(previous: DayStatus, value: number, target: number, isToday: boolean, perWeek: boolean): DayStatus {
  if (value >= target - 1e-9) return "done";
  if (value > 0) return "partial";
  if (previous === "done" || previous === "partial") return isToday ? "open" : perWeek ? "off" : "missed";
  return previous;
}

function DayDot({
  status,
  value,
  target,
  color,
  date,
  label,
  onClick,
}: {
  status: DayStatus;
  value: number;
  target: number;
  color: string;
  date: string;
  label: string;
  onClick?: () => void;
}) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  const style =
    status === "done"
      ? { background: color, borderColor: color }
      : status === "partial"
        ? { background: `conic-gradient(${color} ${pct}%, var(--muted) 0)`, borderColor: color }
        : status === "open"
          ? { borderColor: color }
          : {};
  const content = (
    <span
      className={cn(
        "grid size-8 place-items-center rounded-full border-2 transition-transform",
        status === "missed" && "border-dashed border-border",
        status === "off" && "border-transparent bg-muted/70",
        onClick && "active:scale-90",
      )}
      style={style}
    >
      {status === "done" ? <Heart className="size-4 text-white" /> : null}
    </span>
  );
  return (
    <span className="flex flex-col items-center gap-1">
      {onClick ? (
        <button type="button" onClick={onClick} aria-label={label} title={label} className="rounded-full">
          {content}
        </button>
      ) : (
        <span role="img" aria-label={label} title={label}>
          {content}
        </span>
      )}
      <span className="text-[10px] text-muted-foreground">{weekdayInitial(date)}</span>
    </span>
  );
}

export function HabitCard({
  habit,
  goal,
  frequencyLabel,
  goalLabel,
  perWeekTimes,
  today,
  participants,
  people,
  canManage,
  canDelete,
}: {
  habit: HabitRow;
  goal: HabitGoal;
  frequencyLabel: string;
  goalLabel: string | null;
  perWeekTimes: number | null;
  today: string;
  participants: HabitCardParticipant[];
  people: { memberId: string | null; label: string }[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const target = goal.kind === "count" ? goal.target : 1;
  const unit = goal.kind === "count" ? goal.unit : null;
  const step = amountStep(goal);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(date: string, value: number) {
    const previous = overrides[date];
    setOverrides((o) => ({ ...o, [date]: value }));
    setError(null);
    try {
      const response = await fetch(`/api/habits/${habit.id}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, value }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Не получилось сохранить");
      }
      router.refresh();
    } catch (e) {
      setOverrides((o) => {
        const next = { ...o };
        if (previous === undefined) delete next[date];
        else next[date] = previous;
        return next;
      });
      setError(e instanceof Error ? e.message : "Не получилось сохранить");
    }
  }

  async function remove() {
    if (!window.confirm(`Удалить «${habit.title}» вместе с историей?`)) return;
    const response = await fetch(`/api/habits/${habit.id}`, { method: "DELETE" });
    if (response.ok) router.refresh();
    else setError("Не получилось удалить");
  }

  return (
    <article className="card-soft grid min-w-0 grid-cols-1 gap-3 p-4">
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-2xl bg-secondary text-xl">
            {habit.emoji || "🐾"}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold leading-snug break-words">{habit.title}</h3>
            <p className="text-xs text-muted-foreground">
              {frequencyLabel}
              {goalLabel ? ` · ${goalLabel}` : ""}
            </p>
          </div>
        </div>
        {canManage ? (
          <div className="flex shrink-0 gap-1">
            <Button type="button" size="xs" variant="ghost" onClick={() => setEditing((v) => !v)}>
              Изменить
            </Button>
            {canDelete ? (
              <Button type="button" size="xs" variant="ghost" onClick={() => void remove()}>
                Удалить
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="grid gap-3">
        {participants.map((p) => {
          const strip = p.strip.map((day) => {
            const value = p.isYou && day.date in overrides ? overrides[day.date] : day.value;
            return {
              ...day,
              value,
              status:
                p.isYou && day.date in overrides
                  ? nextStatus(day.status, value, target, day.date === today, perWeekTimes !== null)
                  : day.status,
            };
          });
          const todayDay = strip[strip.length - 1];
          const todayDone = todayDay.status === "done";
          return (
            <div key={p.memberId} className="grid gap-2 rounded-xl bg-muted/40 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: p.color }} />
                  {p.label}
                  {p.isYou ? <span className="text-muted-foreground">(ты)</span> : null}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className={cn(p.streakCount > 0 && "font-semibold text-foreground")}>
                    {p.streakCount > 0 ? "🔥 " : ""}
                    {p.streakLabel}
                  </span>
                  {perWeekTimes !== null && p.thisWeek !== null ? (
                    <span>
                      · {p.thisWeek}/{perWeekTimes} на этой неделе
                    </span>
                  ) : null}
                  {p.rate30 !== null ? <span>· {Math.round(p.rate30 * 100)}% (30 дн.)</span> : null}
                </span>
              </div>

              <div className="flex items-end justify-between gap-1">
                {strip.map((day) => (
                  <DayDot
                    key={day.date}
                    date={day.date}
                    status={day.status}
                    value={day.value}
                    target={target}
                    color={p.color}
                    label={`${p.label} · ${day.date}: ${
                      day.value > 0 && day.status !== "done" ? `${formatAmount(day.value)} из ${formatAmount(target)}` : STATUS_LABEL[day.status]
                    }`}
                    onClick={
                      day.canEdit
                        ? () => void save(day.date, day.status === "done" ? 0 : target)
                        : undefined
                    }
                  />
                ))}
              </div>

              {p.isYou && todayDay.canEdit ? (
                goal.kind === "check" ? (
                  <Button
                    type="button"
                    variant={todayDone ? "secondary" : "default"}
                    onClick={() => void save(today, todayDone ? 0 : 1)}
                  >
                    {todayDone ? "Сегодня готово ♥ (отменить)" : "Отметить на сегодня"}
                  </Button>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Меньше"
                      disabled={todayDay.value <= 0}
                      onClick={() => void save(today, Math.max(0, roundAmount(todayDay.value - step)))}
                    >
                      −
                    </Button>
                    <span className="text-sm tabular-nums">
                      <span className={cn("text-lg font-semibold", todayDone && "text-income")}>
                        {formatAmount(todayDay.value)}
                      </span>{" "}
                      / {formatAmount(target)} {unit ?? ""} сегодня
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      aria-label="Больше"
                      onClick={() => void save(today, roundAmount(todayDay.value + step))}
                    >
                      +
                    </Button>
                  </div>
                )
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {editing ? (
        <div className="border-t border-border pt-3">
          <HabitForm people={people} defaultOwner={habit.owner_member_id} habit={habit} onDone={() => setEditing(false)} />
        </div>
      ) : null}
    </article>
  );
}
