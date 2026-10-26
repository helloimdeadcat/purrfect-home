import Link from "next/link";

import { buildMonthGrid, dayIso } from "@/lib/calculations/calendar-grid";
import { displayMoney } from "@/lib/calculations/money";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/services/calendar-service";

type Props = {
  year: number;
  month: number;
  today: string;
  eventsByDate: Record<string, CalendarEvent[]>;
  selectedDate: string | null;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarMonthGrid({
  year,
  month,
  today,
  eventsByDate,
  selectedDate,
}: Props) {
  const rows = buildMonthGrid(year, month);

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((label) => (
          <div key={label} className="py-1 font-medium">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {rows.flatMap((row, rowIndex) =>
          row.map((day, colIndex) => {
            if (day == null) {
              return (
                <div
                  key={`pad-${rowIndex}-${colIndex}`}
                  className="min-h-16 rounded-lg bg-muted/30 sm:min-h-20"
                />
              );
            }
            const iso = dayIso(year, month, day);
            const dayEvents = eventsByDate[iso] ?? [];
            const isToday = iso === today;
            const isSelected = iso === selectedDate;
            const hasOverdue = dayEvents.some(
              (event) => event.status === "overdue",
            );

            return (
              <Link
                key={iso}
                href={`/app/calendar?month=${year}-${String(month).padStart(2, "0")}&day=${iso}`}
                className={cn(
                  "flex min-h-16 min-w-0 flex-col gap-1 rounded-lg border border-border p-1.5 text-left transition-colors hover:bg-muted/40 sm:min-h-20",
                  isToday && "border-foreground/40",
                  isSelected && "bg-muted/60",
                  hasOverdue && "border-destructive/50",
                )}
              >
                <span
                  className={cn(
                    "text-xs font-medium",
                    isToday && "underline underline-offset-2",
                  )}
                >
                  {day}
                </span>
                <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span
                      key={event.id}
                      className={cn(
                        "truncate text-[10px] leading-tight sm:text-xs",
                        event.cashFlow === "income" && "text-income",
                        event.cashFlow === "expense" && "text-expense",
                        !event.isActual && "opacity-70",
                      )}
                      title={`${event.title} ${displayMoney(event.amount, event.currency)}`}
                    >
                      {event.title}
                    </span>
                  ))}
                  {dayEvents.length > 3 ? (
                    <span className="text-[10px] text-muted-foreground">
                      +{dayEvents.length - 3}
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          }),
        )}
      </div>
    </div>
  );
}
