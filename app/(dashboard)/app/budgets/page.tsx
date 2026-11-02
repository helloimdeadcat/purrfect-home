import { redirect } from "next/navigation";

import { BudgetCard } from "@/components/budgets/budget-card";
import { CreateBudgetForm } from "@/components/budgets/create-budget-form";
import { MonthSwitcher } from "@/components/budgets/month-switcher";
import { canWrite, getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { dateFromIsoDay, parseYearMonth } from "@/lib/calculations/budget-month";
import { listExpenseCategoriesForBudgets } from "@/lib/data/categories";
import { listBudgetsForMonth } from "@/services/budget-service";
import { getHouseholdToday } from "@/services/settings-service";
import { EmptyState } from "@/components/cute/empty-state";

type Props = {
  searchParams: Promise<{ month?: string }>;
};

export default async function BudgetsPage({ searchParams }: Props) {
  const { month: monthParam } = await searchParams;
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const { today } = await getHouseholdToday(supabase, ctx);
  const { year, month } = parseYearMonth(monthParam, dateFromIsoDay(today));
  const manage = canWrite(ctx.role);

  const [budgetsResult, categoriesResult] = await Promise.all([
    listBudgetsForMonth(
      supabase,
      ctx,
      monthParam && /^\d{4}-\d{2}$/.test(monthParam)
        ? monthParam
        : undefined,
    ),
    listExpenseCategoriesForBudgets(supabase, ctx.householdId),
  ]);

  const payload = budgetsResult.data;
  const budgets = payload?.budgets ?? [];
  const categories = categoriesResult.data ?? [];
  const loadError =
    budgetsResult.error?.message ?? categoriesResult.error ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Бюджеты</h1>
        <p className="text-muted-foreground">
          Месячные лимиты расходов по категориям для «{ctx.householdName}».
          Лимиты в {ctx.currency}; переводы расходами не считаются.
        </p>
      </div>

      <MonthSwitcher year={year} month={month} />

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      <section className="grid gap-3">
        {budgets.length === 0 ? (
          <EmptyState title="В этом месяце бюджетов нет">Задай месячный лимит для категории — и траты будут под контролем 🐱</EmptyState>
        ) : (
          budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              canManage={manage}
            />
          ))
        )}
      </section>

      {manage ? (
        <CreateBudgetForm
          month={payload?.month ?? `${year}-${String(month).padStart(2, "0")}`}
          currency={ctx.currency}
          categories={categories}
          usedCategoryIds={budgets
            .map((b) => b.category_id)
            .filter((id): id is string => Boolean(id))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Ты можешь только смотреть бюджеты семьи. Создавать и изменять их
          могут владелец или участник.
        </p>
      )}
    </div>
  );
}
