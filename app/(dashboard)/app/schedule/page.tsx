import Link from "next/link";
import { redirect } from "next/navigation";

import { TaskForm } from "@/components/tasks/task-form";
import { ScheduleItem } from "@/components/tasks/schedule-item";
import { buttonVariants } from "@/components/ui/button";
import { getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { addDays, weekStart } from "@/lib/calculations/task-schedule";
import { WEEKDAY_SHORT } from "@/lib/tasks/describe";
import { cn } from "@/lib/utils";
import { getHouseholdToday } from "@/services/settings-service";
import { loadTaskView } from "@/services/task-view-service";

type Props = {
  searchParams: Promise<{ week?: string }>;
};

function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

export default async function SchedulePage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");
  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const { today } = await getHouseholdToday(supabase, ctx);
  const anchor = params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : today;
  const monday = weekStart(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const { data: view, error } = await loadTaskView(supabase, ctx, { from: days[0], to: days[6] });
  if (!view) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      </div>
    );
  }

  const nav = (label: string, week: string) => (
    <Link href={`/app/schedule?week=${week}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Schedule</h1>
          <p className="text-muted-foreground">
            Week of {dayLabel(days[0])} – {dayLabel(days[6])} · who is doing what
          </p>
        </div>
        <div className="flex gap-2">
          {nav("← Prev", addDays(monday, -7))}
          {nav("This week", today)}
          {nav("Next →", addDays(monday, 7))}
        </div>
      </div>

      <ul aria-label="People" className="flex flex-wrap gap-3 text-sm">
        {view.personOptions.map((p) => (
          <li key={p.memberId ?? "together"} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-full" style={{ background: p.color }} />
            {p.label}
          </li>
        ))}
      </ul>

      {view.canEdit ? (
        <details className="card-soft p-4">
          <summary className="cursor-pointer font-medium">＋ Add to schedule</summary>
          <div className="mt-3">
            <TaskForm
              people={view.personOptions}
              defaultDate={days.includes(today) ? today : days[0]}
              defaultAssignee={view.myMemberId}
            />
          </div>
        </details>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-7">
        {days.map((date, index) => {
          const items = view.agenda.byDate[date] ?? [];
          const isToday = date === today;
          return (
            <section
              key={date}
              aria-label={`${WEEKDAY_SHORT[index]} ${dayLabel(date)}`}
              className={cn(
                "flex min-w-0 flex-col gap-2 rounded-2xl p-2",
                isToday ? "bg-secondary/70 ring-1 ring-primary/30" : "bg-muted/50",
              )}
            >
              <h2 className="flex items-baseline justify-between px-1 text-sm">
                <span className="font-semibold">{WEEKDAY_SHORT[index]}</span>
                <span className={cn("text-muted-foreground", isToday && "font-semibold text-primary")}>
                  {isToday ? "Today" : dayLabel(date)}
                </span>
              </h2>
              {items.length === 0 ? (
                <p className="px-1 pb-1 text-xs text-muted-foreground">Free ♥</p>
              ) : (
                <ul className="grid gap-1.5">
                  {items.map((item) => {
                    const person = view.personOf(item);
                    return (
                      <ScheduleItem
                        key={`${item.key}:${item.done}`}
                        item={item}
                        personLabel={person.label}
                        personColor={person.color}
                        canEdit={view.canEdit}
                      />
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Edit or delete items on the{" "}
        <Link href="/app/tasks" className="underline underline-offset-4">
          To-do
        </Link>{" "}
        page. Changes to repeating items apply to every date.
      </p>
    </div>
  );
}
