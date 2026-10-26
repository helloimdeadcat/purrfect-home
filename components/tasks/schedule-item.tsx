"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AgendaItem } from "@/lib/calculations/task-schedule";
import { describeTime } from "@/lib/tasks/describe";
import { cn } from "@/lib/utils";

/** Compact schedule card: colour strip for the person, time, title, tick. */
export function ScheduleItem({
  item,
  personLabel,
  personColor,
  canEdit,
}: {
  item: AgendaItem;
  personLabel: string;
  personColor: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState(item.done);

  async function toggle() {
    const next = !done;
    setDone(next);
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
    }
  }

  const time = describeTime(item.startTime, item.endTime);

  return (
    <li
      className="flex gap-2 rounded-xl border border-border bg-card p-2 text-sm shadow-[0_4px_12px_-10px_rgb(201_61_120/40%)]"
      style={{ borderLeft: `4px solid ${personColor}` }}
    >
      <input
        type="checkbox"
        checked={done}
        disabled={!canEdit}
        onChange={() => void toggle()}
        aria-label={`Mark "${item.title}" as ${done ? "not done" : "done"}`}
        className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
      />
      <div className="min-w-0">
        {time ? <p className="text-xs font-semibold tabular-nums">{time}</p> : null}
        <p className={cn("break-words leading-snug", done && "text-muted-foreground line-through")}>
          {item.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">{personLabel}</p>
      </div>
    </li>
  );
}
