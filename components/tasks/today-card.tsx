import Link from "next/link";

import { Heart } from "@/components/cute/illustrations";
import { ScheduleItem } from "@/components/tasks/schedule-item";
import type { TaskView } from "@/services/task-view-service";

/** Dashboard card: today's to-dos and events for both partners. */
export function TodayCard({ view }: { view: TaskView }) {
  const items = [...view.agenda.overdue, ...(view.agenda.byDate[view.today] ?? [])];
  const open = items.filter((item) => !item.done).length;

  return (
    <section className="card-soft grid gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-medium">
          <Heart className="size-4 text-primary" /> Today together
        </h2>
        <Link href="/app/tasks" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          All to-dos
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing planned today — a free day ♥</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {open === 0 ? "Everything done — well done, you two!" : `${open} left to do`}
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {items.slice(0, 8).map((item) => {
              const person = view.personOf(item);
              return (
                <ScheduleItem
                  key={`${item.key}:${item.done}`}
                  item={item}
                  personLabel={item.overdue ? `${person.label} · overdue` : person.label}
                  personColor={person.color}
                  canEdit={view.canEdit}
                />
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
