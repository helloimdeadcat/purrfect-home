import Link from "next/link";
import { redirect } from "next/navigation";

import { CalendarDayPanel } from "@/components/calendar/calendar-day-panel";
import { CalendarMonthGrid } from "@/components/calendar/calendar-month-grid";
import { CalendarMonthSwitcher } from "@/components/calendar/calendar-month-switcher";
import { buttonVariants } from "@/components/ui/button";
import {
  canWrite,
  getHouseholdContext,
} from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import {
  dateFromIsoDay,
  parseYearMonth,
} from "@/lib/calculations/budget-month";
import { dayIso } from "@/lib/calculations/calendar-grid";
import { addMoney, displayMoney, zeroMoney } from "@/lib/calculations/money";
import { cn } from "@/lib/utils";
import { getCalendarMonth } from "@/services/calendar-service";
import { listDueOccurrences } from "@/services/recurring-service";
import { getHouseholdToday } from "@/services/settings-service";
import { LOCALE } from "@/lib/locale";

const pluralRules = new Intl.PluralRules(LOCALE);

function plural(
  count: number,
  forms: { one: string; few: string; many: string },
): string {
  const rule = pluralRules.select(count);
  return rule === "one" ? forms.one : rule === "few" ? forms.few : forms.many;
}

const monthTitleFormat = new Intl.DateTimeFormat(LOCALE, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

type Props = {
  searchParams: Promise<{ month?: string; day?: string }>;
};

export default async function CalendarPage({ searchParams }: Props) {
  const params = await searchParams;

  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const { today } = await getHouseholdToday(supabase, ctx);
  const { year, month } = parseYearMonth(params.month, dateFromIsoDay(today));

  const manage = canWrite(ctx.role);

  const [calendarResult, dueResult] = await Promise.all([
    getCalendarMonth(supabase, ctx, year, month),
    listDueOccurrences(supabase, ctx),
  ]);

  const loadError =
    calendarResult.error?.message ?? dueResult.error?.message ?? null;
  const calendar = calendarResult.data;
  const due = dueResult.data ?? [];
  const dueByOccurrenceId = new Map(due.map((item) => [item.id, item]));

  const monthTitle = monthTitleFormat.format(new Date(Date.UTC(year, month - 1, 1)));
  const defaultDay =
    calendar &&
    params.day &&
    params.day >= calendar.rangeStart &&
    params.day <= calendar.rangeEnd
      ? params.day
      : calendar
        ? calendar.today >= calendar.rangeStart &&
          calendar.today <= calendar.rangeEnd
          ? calendar.today
          : dayIso(year, month, 1)
        : null;

  const selectedEvents =
    calendar && defaultDay
      ? (calendar.eventsByDate[defaultDay] ?? [])
      : [];

  // Per-currency totals — never add EUR and USD into one figure.
  const actualByCurrency = new Map<string, { income: string; expense: string }>();
  actualByCurrency.set(ctx.currency.toUpperCase(), {
    income: zeroMoney(),
    expense: zeroMoney(),
  });
  for (const event of calendar?.events ?? []) {
    if (!event.isActual) continue;
    const code = event.currency.toUpperCase();
    const entry = actualByCurrency.get(code) ?? {
      income: zeroMoney(),
      expense: zeroMoney(),
    };
    if (event.cashFlow === "income") {
      entry.income = addMoney(entry.income, event.amount);
    } else if (event.cashFlow === "expense") {
      entry.expense = addMoney(entry.expense, event.amount);
    }
    actualByCurrency.set(code, entry);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Календарь</h1>
          <p className="text-muted-foreground">
            Календарь платежей для «{ctx.householdName}». Будущие регулярные
            платежи видны здесь, но проводятся, только когда ты их подтвердишь.
          </p>
        </div>
        <Link
          href="/app/recurring"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Регулярные платежи
        </Link>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      <CalendarMonthSwitcher year={year} month={month} />

      {calendar ? (
        <>
          {[...actualByCurrency.entries()].map(([code, totals]) => (
            <div
              key={code}
              className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2"
            >
              <p>
                Фактический доход за месяц ({code}):{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {displayMoney(totals.income, code)}
                </span>
              </p>
              <p>
                Фактические расходы за месяц ({code}):{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {displayMoney(totals.expense, code)}
                </span>
              </p>
            </div>
          ))}

          <CalendarMonthGrid
            year={year}
            month={month}
            today={calendar.today}
            eventsByDate={calendar.eventsByDate}
            selectedDate={defaultDay}
          />

          {defaultDay ? (
            <CalendarDayPanel
              date={defaultDay}
              events={selectedEvents}
              canManage={manage}
              dueByOccurrenceId={dueByOccurrenceId}
            />
          ) : null}

          <p className="text-xs text-muted-foreground">
            {calendar.events.length}{" "}
            {plural(calendar.events.length, { one: "событие", few: "события", many: "событий" })}{" "}
            за {monthTitle}. Переводы не показаны. Неподтверждённые регулярные
            платежи в итогах не учитываются.
          </p>
        </>
      ) : null}
    </div>
  );
}
