import Link from "next/link";

import { macroLine, WeighBadge } from "@/components/meals/nutrition-bits";
import type { Macros } from "@/lib/calculations/nutrition";
import { SLOT_EMOJI, SLOT_LABEL } from "@/lib/meals/labels";
import type { FoodRow, MealRow, PortionRow } from "@/services/meal-service";

type PersonCol = { memberId: string; label: string; color: string };

function recipeQuestion(meal: MealRow, foodNames: string[]) {
  const list = foodNames.filter(Boolean).join(", ");
  return `Подскажи рецепт для «${meal.title}» (${SLOT_LABEL[meal.slot].toLowerCase()}) из этих продуктов: ${list}. Граммовки — как в нашем плане.`;
}

/** Read-only meal: dish, ingredients with grams per person, totals per person. */
export function MealViewCard({
  meal,
  portions,
  foods,
  people,
  totals,
}: {
  meal: MealRow;
  portions: PortionRow[];
  foods: Map<string, FoodRow>;
  people: PersonCol[];
  totals: Record<string, Macros> | undefined;
}) {
  const foodIds = [...new Set(portions.map((p) => p.food_id))];
  const grams = (foodId: string, memberId: string) =>
    portions.find((p) => p.food_id === foodId && p.member_id === memberId)?.grams;

  return (
    <article className="card-soft grid min-w-0 gap-3 p-4">
      <header>
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">
          {SLOT_EMOJI[meal.slot]} {SLOT_LABEL[meal.slot]}
        </p>
        <h3 className="font-semibold leading-snug">{meal.title}</h3>
      </header>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="pb-1 text-left font-normal">Food</th>
            {people.map((p) => (
              <th key={p.memberId} className="pb-1 text-right font-normal">
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: p.color }} />
                  {p.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {foodIds.map((foodId) => {
            const food = foods.get(foodId);
            return (
              <tr key={foodId} className="border-t border-border/60">
                <td className="py-1 pr-2">
                  {food?.name ?? "Unknown food"}
                  <WeighBadge mode={food?.weigh_mode ?? null} />
                </td>
                {people.map((p) => {
                  const g = grams(foodId, p.memberId);
                  return (
                    <td key={p.memberId} className="py-1 text-right tabular-nums">
                      {g ? `${Number(g)} g` : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="grid gap-0.5 text-xs text-muted-foreground">
        {people.map((p) => (
          <li key={p.memberId}>
            <span className="font-medium text-foreground">{p.label}:</span> {macroLine(totals?.[p.memberId])}
          </li>
        ))}
      </ul>
      <Link
        href={`/app/assistant?q=${encodeURIComponent(recipeQuestion(meal, foodIds.map((id) => foods.get(id)?.name ?? "")))}`}
        className="justify-self-start text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        ✨ Recipe idea
      </Link>
    </article>
  );
}
