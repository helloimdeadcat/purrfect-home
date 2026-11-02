import { redirect } from "next/navigation";

import { EmptyState } from "@/components/cute/empty-state";
import { HabitCard } from "@/components/habits/habit-card";
import { HabitForm } from "@/components/habits/habit-form";
import { getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { describeFrequency, describeGoal, describeStreak } from "@/lib/habits/describe";
import { loadHabitBoard } from "@/services/habit-service";

export default async function HabitsPage() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");
  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const { data, error } = await loadHabitBoard(supabase, ctx);
  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Привычки</h1>
        <p className="text-sm text-destructive" role="alert">
          {error?.message}
        </p>
      </div>
    );
  }

  const people = [
    { memberId: null, label: "Мы оба (каждый отмечает своё)" },
    ...data.people.list.map((p) => ({ memberId: p.memberId, label: p.isYou ? `${p.label} (ты)` : p.label })),
  ];
  const canAdd = data.habits.length === 0 || data.habits[0].canManage;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Привычки</h1>
        <p className="text-muted-foreground">
          Маленькие ритуалы рядом друг с другом. Отмечай свои дни — до недели назад —
          и поддерживайте друг друга.
        </p>
      </div>

      {canAdd ? (
        <details className="card-soft p-4" open={data.habits.length === 0}>
          <summary className="cursor-pointer font-medium">＋ Новая привычка</summary>
          <div className="mt-3">
            <HabitForm people={people} defaultOwner={null} />
          </div>
        </details>
      ) : null}

      {data.habits.length === 0 ? (
        <EmptyState title="Привычек пока нет">
          Начни с малого: пить воду, вечерняя прогулка вместе, 10 страниц книги.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.habits.map((view) => (
            <HabitCard
              key={view.habit.id}
              habit={view.habit}
              goal={view.rules.goal}
              frequencyLabel={describeFrequency(view.rules.frequency)}
              goalLabel={describeGoal(view.rules.goal)}
              perWeekTimes={view.rules.frequency.kind === "per_week" ? view.rules.frequency.times : null}
              today={data.today}
              people={people}
              canManage={view.canManage}
              canDelete={view.canDelete}
              participants={view.participants.map((p) => ({
                memberId: p.person.memberId!,
                label: p.person.label,
                color: p.person.color,
                isYou: p.isYou,
                strip: p.strip,
                streakLabel: describeStreak(p.streak),
                streakCount: p.streak.count,
                rate30: p.rate30,
                thisWeek: p.thisWeek,
              }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
