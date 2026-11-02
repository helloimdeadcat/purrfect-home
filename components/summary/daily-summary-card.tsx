import Link from "next/link";
import type { ReactNode } from "react";

import { CatFace, PawPrint } from "@/components/cute/illustrations";
import { ScheduleItem } from "@/components/tasks/schedule-item";
import { buttonVariants } from "@/components/ui/button";
import { displayMoney } from "@/lib/calculations/money";
import { LOCALE } from "@/lib/locale";
import { SLOT_EMOJI, SLOT_LABEL } from "@/lib/meals/labels";
import { askMortyHref, habitsWord, paymentsWord, tasksWord } from "@/lib/summary/daily-summary";
import { cn } from "@/lib/utils";
import type { DailySummary } from "@/services/summary-service";

const MAX_TASKS = 6;
const MAX_HABITS = 4;

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function NoData() {
  return <p className="text-sm text-muted-foreground">нет данных</p>;
}

/** One summary row: emoji, title linking to its page, content. */
function Row({ emoji, title, href, children }: { emoji: string; title: string; href: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Link
        href={href}
        className="flex w-fit items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
      >
        <span aria-hidden>{emoji}</span> {title}
        <span aria-hidden className="text-muted-foreground">›</span>
      </Link>
      {children}
    </div>
  );
}

/** Dashboard «Сводка на сегодня»: to-dos (interactive), meals, habits, money. */
export function DailySummaryCard({ summary }: { summary: DailySummary }) {
  const { tasks, meals, habits, money } = summary;

  return (
    <section className="card-soft grid gap-4 p-4" aria-labelledby="daily-summary-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CatFace className="size-9 shrink-0" />
          <div>
            <h2 id="daily-summary-title" className="font-medium" style={{ fontFamily: "var(--font-heading)" }}>
              Сводка на сегодня
            </h2>
            <p className="text-xs text-muted-foreground first-letter:uppercase">
              {dateFormat.format(new Date(`${summary.today}T00:00:00Z`))}
            </p>
          </div>
        </div>
        <Link href={askMortyHref()} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          ✨ Спросить Морти
        </Link>
      </div>

      <Row emoji="📝" title="Дела" href="/app/tasks">
        {!tasks.ok ? (
          <NoData />
        ) : tasks.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">На сегодня ничего не запланировано — свободный день ♥</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {tasks.data.counts.open === 0
                ? "Всё готово — вы молодцы! 🐾"
                : [
                    `${tasks.data.counts.open} ${tasksWord(tasks.data.counts.open)}`,
                    tasks.data.counts.mine ? `мне ${tasks.data.counts.mine}` : null,
                    tasks.data.counts.together ? `вместе ${tasks.data.counts.together}` : null,
                    tasks.data.counts.partner
                      ? `${tasks.data.partnerLabel ?? "партнёру"} ${tasks.data.counts.partner}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
              {tasks.data.counts.overdue > 0 ? (
                <span className="text-expense"> · просрочено {tasks.data.counts.overdue}</span>
              ) : null}
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {tasks.data.items.slice(0, MAX_TASKS).map(({ item, personLabel, personColor }) => (
                <ScheduleItem
                  key={`${item.key}:${item.done}`}
                  item={item}
                  personLabel={item.overdue ? `${personLabel} · просрочено` : personLabel}
                  personColor={personColor}
                  canEdit={tasks.data.canEdit}
                />
              ))}
            </ul>
            {tasks.data.items.length > MAX_TASKS ? (
              <Link href="/app/tasks" className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline">
                ещё {tasks.data.items.length - MAX_TASKS}
              </Link>
            ) : null}
          </>
        )}
      </Row>

      <div className="grid gap-4 sm:grid-cols-3">
        <Row emoji="🍽️" title="Питание" href="/app/meals">
          {!meals.ok ? (
            <NoData />
          ) : !meals.data.hasPlan ? (
            <p className="text-sm text-muted-foreground">Плана питания пока нет</p>
          ) : meals.data.meals.length === 0 ? (
            <p className="text-sm text-muted-foreground">На сегодня блюд нет</p>
          ) : (
            <>
              <ul className="grid gap-0.5 text-sm">
                {meals.data.meals.map((meal) => (
                  <li key={meal.id} className="truncate">
                    <span aria-hidden>{SLOT_EMOJI[meal.slot]}</span>{" "}
                    <span className="text-muted-foreground">{SLOT_LABEL[meal.slot]}:</span> {meal.title}
                  </li>
                ))}
              </ul>
              {meals.data.people.map((person) => (
                <p key={person.memberId} className="text-xs text-muted-foreground tabular-nums">
                  {person.isYou ? "Ты" : person.label}: {person.kcal}
                  {person.targetKcal !== null ? ` / ${person.targetKcal}` : ""} ккал
                </p>
              ))}
            </>
          )}
        </Row>

        <Row emoji="🐾" title="Привычки" href="/app/habits">
          {!habits.ok ? (
            <NoData />
          ) : habits.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">На сегодня всё отмечено 💚</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Осталось отметить: {habits.data.length} {habitsWord(habits.data.length)}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {habits.data.slice(0, MAX_HABITS).map((habit) => (
                  <li key={habit.id} className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                    {habit.emoji ? `${habit.emoji} ` : ""}
                    {habit.title}
                  </li>
                ))}
                {habits.data.length > MAX_HABITS ? (
                  <li className="px-1 text-xs text-muted-foreground">+{habits.data.length - MAX_HABITS}</li>
                ) : null}
              </ul>
            </>
          )}
        </Row>

        <Row emoji="💸" title="Деньги" href={money.ok && money.data.due.length > 0 ? "/app/recurring" : "/app/transactions"}>
          {!money.ok ? (
            <NoData />
          ) : (
            <>
              <p className="text-sm">
                <span className="text-muted-foreground">Можно потратить: </span>
                <span className={cn("font-semibold tabular-nums", money.data.isDeficit && "text-expense")}>
                  {displayMoney(money.data.safeToSpend, money.data.currency)}
                </span>
              </p>
              {money.data.due.length > 0 ? (
                <Link
                  href="/app/recurring"
                  className="flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  <PawPrint className="size-3 text-primary" />
                  {money.data.due.length} {paymentsWord(money.data.due.length)} к оплате
                  {money.data.overdue > 0 ? <span className="text-expense"> (просрочено {money.data.overdue})</span> : null}
                </Link>
              ) : (
                <p className="text-xs text-muted-foreground">Сегодня платежей нет</p>
              )}
            </>
          )}
        </Row>
      </div>
    </section>
  );
}
