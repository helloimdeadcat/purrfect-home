import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateGoalForm } from "@/components/goals/create-goal-form";
import { GoalCard } from "@/components/goals/goal-card";
import { buttonVariants } from "@/components/ui/button";
import {
  canAdmin,
  canWrite,
  getHouseholdContext,
} from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { listGoals } from "@/services/goal-service";
import { EmptyState } from "@/components/cute/empty-state";

type Props = {
  searchParams: Promise<{ archived?: string }>;
};

export default async function GoalsPage({ searchParams }: Props) {
  const { archived } = await searchParams;
  const includeArchived = archived === "1";

  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const manage = canWrite(ctx.role);
  const canDelete = canAdmin(ctx.role);

  const { data: goals, error } = await listGoals(supabase, ctx, {
    includeArchived,
  });

  const list = goals ?? [];
  const active = list.filter((goal) => !goal.is_archived);
  const archivedGoals = list.filter((goal) => goal.is_archived);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Цели</h1>
          <p className="text-muted-foreground">
            Общие цели накоплений для «{ctx.householdName}». Суммы хранятся в
            валюте цели — конвертации валют пока нет.
          </p>
        </div>
        <Link
          href={
            includeArchived ? "/app/goals" : "/app/goals?archived=1"
          }
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          {includeArchived ? "Скрыть архив" : "Показать архив"}
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}

      <section className="grid gap-3">
        <h2 className="font-medium">Активные</h2>
        {active.length === 0 ? (
          <EmptyState title="Пока нет целей">Создай цель и копите вместе на что-нибудь приятное 💕</EmptyState>
        ) : (
          active.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              canManage={manage}
              canDelete={canDelete}
            />
          ))
        )}
      </section>

      {includeArchived ? (
        <section className="grid gap-3">
          <h2 className="font-medium">В архиве</h2>
          {archivedGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">В архиве пока пусто.</p>
          ) : (
            archivedGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                canManage={manage}
                canDelete={canDelete}
              />
            ))
          )}
        </section>
      ) : null}

      {manage ? <CreateGoalForm defaultCurrency={ctx.currency} /> : null}
    </div>
  );
}
