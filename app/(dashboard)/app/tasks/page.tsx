import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/cute/empty-state";
import { TaskForm } from "@/components/tasks/task-form";
import { TaskItem } from "@/components/tasks/task-item";
import { getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { addDays } from "@/lib/calculations/task-schedule";
import type { AgendaItem } from "@/lib/calculations/task-schedule";
import { cn } from "@/lib/utils";
import { getHouseholdToday } from "@/services/settings-service";
import { loadTaskView, matchesWho, type TaskView } from "@/services/task-view-service";

type Props = {
  searchParams: Promise<{ who?: string }>;
};

/** Days shown ahead of today in the dated sections. */
const HORIZON_DAYS = 13;

function Section({
  title,
  items,
  view,
  showDate = false,
}: {
  title: string;
  items: AgendaItem[];
  view: TaskView;
  showDate?: boolean;
}) {
  if (items.length === 0) return null;
  const open = items.filter((i) => !i.done).length;
  return (
    <section className="grid gap-2">
      <h2 className="flex items-baseline gap-2 font-medium">
        {title}
        <span className="text-sm font-normal text-muted-foreground">
          {open === 0 ? "all done ♥" : `${open} open`}
        </span>
      </h2>
      <ul className="grid gap-2">
        {items.map((item) => {
          const task = view.taskById.get(item.taskId);
          return (
            <TaskItem
              key={`${item.key}:${item.done}`}
              item={item}
              task={task}
              person={view.personOf(item)}
              people={view.personOptions}
              repeatLabel={view.repeatLabelOf(item)}
              showDate={showDate}
              canEdit={view.canEdit}
              canDelete={view.canDeleteTask(task)}
            />
          );
        })}
      </ul>
    </section>
  );
}

export default async function TasksPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");
  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const { today } = await getHouseholdToday(supabase, ctx);
  const { data: view, error } = await loadTaskView(supabase, ctx, {
    from: today,
    to: addDays(today, HORIZON_DAYS),
  });

  if (!view) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">To-do</h1>
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      </div>
    );
  }

  const who = params.who ?? "all";
  const keep = (items: AgendaItem[]) => items.filter((item) => matchesWho(item, who));
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 6);
  const dated = (pred: (date: string) => boolean) =>
    keep(
      Object.entries(view.agenda.byDate)
        .filter(([date]) => pred(date))
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([, items]) => items),
    );

  const sections = {
    overdue: keep(view.agenda.overdue),
    today: dated((d) => d === today),
    tomorrow: dated((d) => d === tomorrow),
    thisWeek: dated((d) => d > tomorrow && d <= weekEnd),
    later: dated((d) => d > weekEnd),
    someday: keep(view.agenda.someday),
  };
  const nothing = Object.values(sections).every((list) => list.length === 0);

  const filters = [
    { key: "all", label: "Everyone", color: "var(--muted-foreground)" },
    ...view.personOptions.map((p) => ({ key: p.memberId ?? "together", label: p.label, color: p.color })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">To-do</h1>
        <p className="text-muted-foreground">
          Shared chores and errands — who does what, and when. Items with a
          time also appear in the{" "}
          <Link href="/app/schedule" className="underline underline-offset-4">
            schedule
          </Link>
          .
        </p>
      </div>

      <nav aria-label="Filter by person" className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/app/tasks" : `/app/tasks?who=${f.key}`}
            aria-current={who === f.key ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
              who === f.key ? "border-primary bg-secondary font-semibold" : "border-border bg-card hover:bg-secondary",
            )}
          >
            <span aria-hidden className="size-2 rounded-full" style={{ background: f.color }} />
            {f.label}
          </Link>
        ))}
      </nav>

      {view.canEdit ? (
        <details className="card-soft p-4" open={nothing}>
          <summary className="cursor-pointer font-medium">＋ New to-do</summary>
          <div className="mt-3">
            <TaskForm
              people={view.personOptions}
              defaultDate={today}
              defaultAssignee={who !== "all" && who !== "together" ? who : view.myMemberId}
            />
          </div>
        </details>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {nothing ? (
        <EmptyState title="Nothing to do — enjoy!">
          Add chores, errands or plans above. Repeat them daily, on certain
          weekdays or monthly.
        </EmptyState>
      ) : (
        <>
          <Section title="Overdue" items={sections.overdue} view={view} showDate />
          <Section title="Today" items={sections.today} view={view} />
          <Section title="Tomorrow" items={sections.tomorrow} view={view} />
          <Section title="This week" items={sections.thisWeek} view={view} showDate />
          <Section title="Next week" items={sections.later} view={view} showDate />
          <Section title="Someday" items={sections.someday} view={view} />
        </>
      )}
    </div>
  );
}
