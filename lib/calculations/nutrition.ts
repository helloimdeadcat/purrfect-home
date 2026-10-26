/**
 * Nutrition math: per-100 g food values × grams, meal/day totals per person,
 * and the weekly shopping list. Pure functions.
 */

export type Macros = { kcal: number; protein: number; fat: number; carbs: number; fiber: number };

export type FoodValues = Macros & { id: string };

export const ZERO_MACROS: Macros = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };

export function macrosFor(food: Macros, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: food.kcal * f,
    protein: food.protein * f,
    fat: food.fat * f,
    carbs: food.carbs * f,
    fiber: food.fiber * f,
  };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    fat: a.fat + b.fat,
    carbs: a.carbs + b.carbs,
    fiber: a.fiber + b.fiber,
  };
}

export function roundMacros(m: Macros): Macros {
  return {
    kcal: Math.round(m.kcal),
    protein: Math.round(m.protein),
    fat: Math.round(m.fat),
    carbs: Math.round(m.carbs),
    fiber: Math.round(m.fiber),
  };
}

export type Portion = { foodId: string; memberId: string; grams: number };

/** Totals per member for a set of portions (one meal or a whole day). */
export function totalsByMember(
  portions: Portion[],
  foods: Map<string, Macros>,
): Map<string, Macros> {
  const out = new Map<string, Macros>();
  for (const p of portions) {
    const food = foods.get(p.foodId);
    if (!food) continue;
    out.set(p.memberId, addMacros(out.get(p.memberId) ?? ZERO_MACROS, macrosFor(food, p.grams)));
  }
  return out;
}

export type NutritionTarget = {
  kcal: number | null;
  proteinMin: number | null;
  proteinMax: number | null;
  fatMin: number | null;
  fatMax: number | null;
};

export type RangeStatus = "below" | "within" | "above" | "none";

/** Where a value sits relative to a [min, max] range (either end optional). */
export function rangeStatus(value: number, min: number | null, max: number | null): RangeStatus {
  if (min === null && max === null) return "none";
  if (min !== null && value < min) return "below";
  if (max !== null && value > max) return "above";
  return "within";
}

export type ShoppingLine = { foodId: string; grams: number };

/**
 * Weekly grams per food summed over everyone (one cycle of the plan),
 * sorted by grams descending within each category by the caller.
 */
export function aggregateShopping(portions: Portion[]): ShoppingLine[] {
  const byFood = new Map<string, number>();
  for (const p of portions) byFood.set(p.foodId, (byFood.get(p.foodId) ?? 0) + p.grams);
  return [...byFood.entries()].map(([foodId, grams]) => ({ foodId, grams }));
}

/** "2 150 g" → "2.15 kg" style compact label (kept locale-free for tests). */
export function formatGrams(grams: number): string {
  if (grams >= 1000) {
    const kg = Math.round(grams / 10) / 100;
    return `${kg} kg`;
  }
  return `${Math.round(grams)} g`;
}
