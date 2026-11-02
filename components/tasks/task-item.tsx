"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { TaskForm } from "@/components/tasks/task-form";
import { Button } from "@/components/ui/button";
import type { AgendaItem } from "@/lib/calculations/task-schedule";
import type { Person } from "@/lib/people";
import { describeTime } from "@/lib/tasks/describe";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];

/**
 * One occurrence of a to-do / event: tick box, who it's for, time and repeat
 * hint. Ticking is optimistic and rolls back if the server refuses.
 */
export function TaskItem({
  item,
  task,
  person,
  people,
  repeatLabel,
  showDate = false,
  canEdit,
  canDelete,
}: {
  item: AgendaItem;
  task: TaskRow | undefined;
  person: Person;
  people: { memberId: string | null; label: string; color: string }[];
  repeatLabel: string | null;
  showDate?: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState(item.done);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !done;
    setDone(next);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${item.taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: item.date, done: next }),
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setDone(!next);
      setError("Не получилось обновить — попробуй ещё раз");
    }
  }

  async function remove() {
    if (!window.confirm(item.repeating ? "Удалить это повторяющееся дело со всеми датами?" : "Удалить это дело?")) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/tasks/${item.taskId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Не получилось удалить");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const time = describeTime(item.startTime, item.endTime);

  return (
    <li className="card-soft overflow-hidden">
      <div className="flex items-start gap-3 py-2.5 pr-3 pl-0">
        <span aria-hidden className="w-1.5 self-stretch rounded-r-full" style={{ background: person.color }} />
        <input
          type="checkbox"
          checked={done}
          onChange={() => void toggle()}
          disabled={!canEdit}
          aria-label={`${done ? "Снять отметку с" : "Отметить готовым"} «${item.title}»`}
          className="mt-1 size-4.5 shrink-0 accent-[var(--primary)]"
        />
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium break-words", done && "text-muted-foreground line-through")}>
            {item.title}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="size-2 rounded-full" style={{ background: person.color }} />
              {person.label}
              {person.isYou ? " (ты)" : ""}
            </span>
            {showDate && item.date ? <span>{item.date}</span> : null}
            {time ? <span className="font-medium text-foreground tabular-nums">{time}</span> : null}
            {repeatLabel ? <span>↻ {repeatLabel}</span> : null}
            {item.overdue ? <span className="font-semibold text-destructive">просрочено</span> : null}
          </p>
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex shrink-0 gap-1">
            <Button type="button" size="xs" variant="ghost" onClick={() => setEditing((v) => !v)} disabled={!task}>
              Изменить
            </Button>
            {canDelete ? (
              <Button type="button" size="xs" variant="ghost" onClick={() => void remove()} disabled={busy}>
                Удалить
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {editing && task ? (
        <div className="border-t border-border bg-muted/40 p-3">
          {item.repeating ? (
            <p className="mb-2 text-xs text-muted-foreground">
              Изменения применятся ко всем датам этого повторяющегося дела.
            </p>
          ) : null}
          <TaskForm people={people} defaultDate={task.start_date} task={task} onDone={() => setEditing(false)} />
        </div>
      ) : null}
    </li>
  );
}
