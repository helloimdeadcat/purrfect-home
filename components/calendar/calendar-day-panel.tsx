import Link from "next/link";

import { DueOccurrenceActions } from "@/components/recurring/due-occurrence-actions";
import { buttonVariants } from "@/components/ui/button";
import { displayMoney } from "@/lib/calculations/money";
import { LOCALE } from "@/lib/locale";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/services/calendar-service";
import type { DueOccurrenceView } from "@/services/recurring-service";

const KIND_LABELS: Record<CalendarEvent["kind"], string> = {
  recurring_occurrence: "Регулярный платёж",
  recurring_projected: "Ожидаемый платёж",
  transaction: "Операция",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "ждёт подтверждения",
  paid: "оплачено",
  skipped: "пропущено",
  overdue: "просрочено",
  scheduled: "запланировано",
};

const dayTitleFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function formatDayTitle(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : dayTitleFormat.format(date);
}

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
        <h2 className="font-medium first-letter:uppercase">{formatDayTitle(date)}</h2>
        <Link
          href="/app/transactions"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          Операции
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">В этот день ничего нет.</p>
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
                    <p className="text-sm text-muted-foreground">
                      {KIND_LABELS[event.kind] ?? event.kind}
                      {event.status
                        ? ` · ${STATUS_LABELS[event.status] ?? event.status}`
                        : ""}
                      {event.isActual ? " · проведено" : " · не проведено"}
                    </p>
                  </div>
                  <p className="font-medium tabular-nums">
                    {displayMoney(event.amount, event.currency)}
                  </p>
                </div>
                {event.kind === "recurring_projected" ? (
                  <p className="text-xs text-muted-foreground">
                    Рассчитано по шаблону — не считается доходом или расходом,
                    пока ты не подтвердишь его в «Регулярных платежах».
                  </p>
                ) : null}
                {event.paymentId ? (
                  <Link
                    href="/app/recurring"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Открыть регулярные платежи
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
