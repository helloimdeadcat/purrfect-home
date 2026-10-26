import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/cute/empty-state";
import { MealEditor } from "@/components/meals/meal-editor";
import {
  AddMealForm,
  FoodForm,
  FoodRowActions,
  ImportPlanPanel,
  PlanNotesForm,
  ShoppingActions,
  TargetsForm,
} from "@/components/meals/meal-forms";
import { MealViewCard } from "@/components/meals/meal-view-card";
import { DaySummary, macroLine, WeighBadge } from "@/components/meals/nutrition-bits";
import { getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { formatGrams } from "@/lib/calculations/nutrition";
import { CATEGORY_LABEL } from "@/lib/meals/labels";
import { WEEKDAY_SHORT } from "@/lib/tasks/describe";
import { cn } from "@/lib/utils";
import { loadMealPlanView, shoppingText, type MealPlanView } from "@/services/meal-service";

const TABS = [
  { key: "today", label: "Today" },
  { key: "plan", label: "Week plan" },
  { key: "shopping", label: "Shopping" },
  { key: "foods", label: "Foods" },
  { key: "targets", label: "Targets" },
] as const;
type Tab = (typeof TABS)[number]["key"];

type Props = {
  searchParams: Promise<{ tab?: string; day?: string }>;
};

function peopleCols(view: MealPlanView) {
  return view.people.list.map((p) => ({ memberId: p.memberId!, label: p.label, color: p.color }));
}

function targetOf(view: MealPlanView, memberId: string) {
  const t = view.targets[memberId];
  return t
    ? { kcal: t.kcal, proteinMin: t.protein_min, proteinMax: t.protein_max, fatMin: t.fat_min, fatMax: t.fat_max }
    : undefined;
}

function DayView({ view, weekday }: { view: MealPlanView; weekday: number }) {
  const people = peopleCols(view);
  const foods = new Map(view.foods.map((f) => [f.id, f]));
  const meals = view.meals.filter((m) => m.weekday === weekday);
  return (
    <div className="grid gap-4">
      <section className="grid gap-2 sm:grid-cols-2">
        {people.map((p) => (
          <DaySummary
            key={p.memberId}
            label={p.label}
            color={p.color}
            totals={view.dayTotals[weekday]?.[p.memberId]}
            target={targetOf(view, p.memberId)}
          />
        ))}
      </section>
      {meals.length === 0 ? (
        <EmptyState title="Nothing planned for this day">Add meals on the Week plan tab.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {meals.map((meal) => (
            <MealViewCard
              key={meal.id}
              meal={meal}
              portions={view.portionsByMeal[meal.id] ?? []}
              foods={foods}
              people={people}
              totals={view.mealTotals[meal.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanEditor({ view, weekday }: { view: MealPlanView; weekday: number }) {
  const people = peopleCols(view);
  const meals = view.meals.filter((m) => m.weekday === weekday);
  const foodOptions = view.foods.map((f) => ({ id: f.id, name: f.name, weigh_mode: f.weigh_mode }));
  return (
    <div className="grid gap-4">
      <nav aria-label="Day" className="flex flex-wrap gap-1.5">
        {WEEKDAY_SHORT.map((label, index) => {
          const day = index + 1;
          return (
            <Link
              key={label}
              href={`/app/meals?tab=plan&day=${day}`}
              aria-current={day === weekday ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                day === weekday ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border bg-card hover:bg-secondary",
                day === view.todayWeekday && day !== weekday && "border-primary/50",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <section className="grid gap-2 sm:grid-cols-2">
        {people.map((p) => (
          <DaySummary
            key={p.memberId}
            label={p.label}
            color={p.color}
            totals={view.dayTotals[weekday]?.[p.memberId]}
            target={targetOf(view, p.memberId)}
          />
        ))}
      </section>
      {meals.map((meal) => {
        const portions = view.portionsByMeal[meal.id] ?? [];
        const foodIds = [...new Set(portions.map((p) => p.food_id))];
        return (
          <MealEditor
            key={`${meal.id}:${meal.updated_at}:${portions.length}`}
            meal={{ id: meal.id, title: meal.title, slot: meal.slot }}
            rows={foodIds.map((foodId) => ({
              foodId,
              grams: Object.fromEntries(
                portions.filter((p) => p.food_id === foodId).map((p) => [p.member_id, Number(p.grams)]),
              ),
            }))}
            foods={foodOptions}
            people={people}
            totalsLines={people.map((p) => ({ label: p.label, line: macroLine(view.mealTotals[meal.id]?.[p.memberId]) }))}
          />
        );
      })}
      {view.canEdit ? <AddMealForm weekday={weekday} /> : null}
      {view.plan ? (
        <details className="card-soft p-4">
          <summary className="cursor-pointer font-medium">Plan notes: weighing rules &amp; cooking tips</summary>
          <div className="mt-3">
            <PlanNotesForm planId={view.plan.id} notes={view.plan.notes} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ShoppingView({ view }: { view: MealPlanView }) {
  if (view.shopping.length === 0) {
    return <EmptyState title="Nothing to buy yet">Add ingredients to the week plan first.</EmptyState>;
  }
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Everything the week plan needs for both of you. Amounts are net (dry,
        raw, edible or drained, as in the plan) — buy a little extra for peel
        and trimming.
      </p>
      {view.canEdit ? <ShoppingActions text={shoppingText(view, CATEGORY_LABEL)} /> : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {view.shopping.map((group) => (
          <section key={group.category} className="card-soft grid gap-2 p-4">
            <h3 className="font-semibold">{CATEGORY_LABEL[group.category]}</h3>
            <ul className="grid gap-1 text-sm">
              {group.lines.map(({ food, grams }) => (
                <li key={food.id} className="flex justify-between gap-3 border-t border-border/60 pt-1 first:border-0 first:pt-0">
                  <span>
                    {food.name}
                    <WeighBadge mode={food.weigh_mode} />
                  </span>
                  <span className="tabular-nums">
                    {formatGrams(grams)}
                    {food.grams_per_piece ? (
                      <span className="text-muted-foreground">
                        {" "}
                        ≈{Math.ceil(grams / Number(food.grams_per_piece))} {food.piece_label ?? "pcs"}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function FoodsView({ view }: { view: MealPlanView }) {
  return (
    <div className="grid gap-4">
      {view.canEdit ? (
        <details className="card-soft p-4">
          <summary className="cursor-pointer font-medium">＋ Add food</summary>
          <div className="mt-3">
            <FoodForm />
          </div>
        </details>
      ) : null}
      {view.foods.length === 0 ? (
        <EmptyState title="No foods yet">Add foods with calories and macros per 100 g.</EmptyState>
      ) : (
        <ul className="grid gap-2">
          {view.foods.map((food) => (
            <li key={food.id} className="card-soft grid gap-1 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {food.name}
                    <WeighBadge mode={food.weigh_mode} />
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    per 100 g: {Number(food.kcal)} kcal · P {Number(food.protein)} / F {Number(food.fat)} / C{" "}
                    {Number(food.carbs)} · fiber {Number(food.fiber)} · {CATEGORY_LABEL[food.shopping_category]}
                  </p>
                </div>
                {view.canEdit ? <FoodRowActions food={food} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function MealsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");
  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const { data: view, error } = await loadMealPlanView(supabase, ctx);
  if (!view) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Meals</h1>
        <p className="text-sm text-destructive" role="alert">
          {error?.message}
        </p>
      </div>
    );
  }

  const tab: Tab = TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "today";
  const day = Number(params.day);
  const weekday = day >= 1 && day <= 7 ? day : view.todayWeekday;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Meals</h1>
        <p className="text-muted-foreground">
          {view.plan ? view.plan.name : "Your shared meal plan"} — same dishes,
          your own portions.
        </p>
      </div>

      {!view.plan ? (
        view.canEdit ? (
          <ImportPlanPanel
            people={view.people.list.map((p) => ({ memberId: p.memberId!, label: p.isYou ? `${p.label} (you)` : p.label }))}
          />
        ) : (
          <EmptyState title="No meal plan yet" />
        )
      ) : (
        <>
          <nav aria-label="Meals sections" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/app/meals?tab=${t.key}`}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors",
                  tab === t.key ? "bg-secondary font-semibold text-secondary-foreground" : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          {tab === "today" ? (
            <>
              <h2 className="font-medium">
                {WEEKDAY_SHORT[view.todayWeekday - 1]}, {view.today}
              </h2>
              <DayView view={view} weekday={view.todayWeekday} />
            </>
          ) : null}
          {tab === "plan" ? <PlanEditor view={view} weekday={weekday} /> : null}
          {tab === "shopping" ? <ShoppingView view={view} /> : null}
          {tab === "foods" ? <FoodsView view={view} /> : null}
          {tab === "targets" ? (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                Daily targets used for the calorie bars and protein/fat checks.
                Recalculate after a 3–5 kg change in weight or activity.
              </p>
              {view.people.list.map((p) => (
                <TargetsForm
                  key={p.memberId}
                  memberId={p.memberId!}
                  label={p.isYou ? `${p.label} (you)` : p.label}
                  target={view.targets[p.memberId!]}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
