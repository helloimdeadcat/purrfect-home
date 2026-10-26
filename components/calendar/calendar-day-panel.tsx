import Link from "next/link";

import { DueOccurrenceActions } from "@/components/recurring/due-occurrence-actions";
import { buttonVariants } from "@/components/ui/button";
import { displayMoney } from "@/lib/calculations/money";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/services/calendar-service";
import type { DueOccurrenceView } from "@/services/recurring-service";

type Props = {
  date: string;
  events: CalendarEvent[];
  canManage: boolean;
  dueByOccurrenceId: Map<string, DueOccurrenceView>;
};

export function CalendarDayPanel({
  date,
  events,
  canManage,
  dueByOccurrenceId,
}: Props) {
  return (
    <section className="grid gap-3 card-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{date}</h2>
        <Link
          href="/app/transactions"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          Transactions
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events on this day.</p>
      ) : (
        <ul className="grid gap-3">
          {events.map((event) => {
            const due =
              event.occurrenceId != null
                ? dueByOccurrenceId.get(event.occurrenceId)
                : undefined;

            if (
              canManage &&
              due &&
              (due.effectiveStatus === "pending" ||
                due.effectiveStatus === "overdue")
            ) {
              return (
                <li key={event.id}>
                  <DueOccurrenceActions occurrence={due} />
                </li>
              );
            }

            return (
              <li
                key={event.id}
                className="grid gap-1 rounded-lg border border-border px-3 py-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm capitalize text-muted-foreground">
                      {event.kind.replaceAll("_", " ")}
                      {event.status ? ` · ${event.status}` : ""}
                      {event.isActual ? " · actual" : " · not posted"}
                    </p>
                  </div>
                  <p className="font-medium tabular-nums">
                    {displayMoney(event.amount, event.currency)}
                  </p>
                </div>
                {event.kind === "recurring_projected" ? (
                  <p className="text-xs text-muted-foreground">
                    Projected from template — not counted as income or expense
                    until confirmed on Recurring.
                  </p>
                ) : null}
                {event.paymentId ? (
                  <Link
                    href="/app/recurring"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Open recurring
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
