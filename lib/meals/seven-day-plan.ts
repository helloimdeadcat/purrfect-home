/**
 * The household's own 7-day plan ("План питания на 7 дней"), transcribed
 * from the PDF for one-click import. Grams per person ("husband" / "wife"
 * columns of the plan — mapped to real members at import time).
 *
 * The PDF gives meal totals only, so per-100 g values are averaged reference
 * values, calibrated so that recomputed meal totals match the plan's own
 * "Итого" lines (see seven-day-plan.test.ts). Package labels win in practice.
 */

import type { MealSlot, ShoppingCategory, WeighMode } from "@/types/database";

export type FoodSeed = {
  key: string;
  name: string;
  weigh: WeighMode;
  category: ShoppingCategory;
  /** per 100 g */
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  gramsPerPiece?: number;
  pieceLabel?: string;
};

export const PLAN_FOODS: FoodSeed[] = [
  { key: "oats", name: "Овсянка", weigh: "dry", category: "grains", kcal: 370, protein: 13, fat: 6.5, carbs: 60, fiber: 10 },
  { key: "buckwheat", name: "Гречка", weigh: "dry", category: "grains", kcal: 343, protein: 13, fat: 3.4, carbs: 62, fiber: 10 },
  { key: "lentils", name: "Чечевица", weigh: "dry", category: "grains", kcal: 350, protein: 24, fat: 1.5, carbs: 52, fiber: 11 },
  { key: "beans", name: "Фасоль консервированная", weigh: "drained", category: "grains", kcal: 100, protein: 7, fat: 0.5, carbs: 15, fiber: 6 },
  { key: "bread", name: "Хлеб", weigh: "package", category: "grains", kcal: 250, protein: 9, fat: 3, carbs: 47, fiber: 5 },
  { key: "pelmeni", name: "Пельмени", weigh: "package", category: "grains", kcal: 239, protein: 11, fat: 10.6, carbs: 28, fiber: 1 },
  { key: "chicken", name: "Куриная грудка", weigh: "raw", category: "meat_fish", kcal: 110, protein: 23, fat: 1.5, carbs: 0, fiber: 0 },
  { key: "salmon", name: "Лосось", weigh: "raw", category: "meat_fish", kcal: 180, protein: 20, fat: 11, carbs: 0, fiber: 0 },
  { key: "sardines", name: "Сардины", weigh: "drained", category: "meat_fish", kcal: 190, protein: 24, fat: 10.5, carbs: 0, fiber: 0 },
  { key: "tuna", name: "Тунец в собственном соку", weigh: "drained", category: "meat_fish", kcal: 110, protein: 25, fat: 1, carbs: 0, fiber: 0 },
  { key: "eggs", name: "Яйца", weigh: "shelled", category: "meat_fish", kcal: 143, protein: 12.6, fat: 9.5, carbs: 0.7, fiber: 0, gramsPerPiece: 57, pieceLabel: "egg" },
  { key: "skyr", name: "Skyr", weigh: "package", category: "dairy", kcal: 63, protein: 11, fat: 0.2, carbs: 4, fiber: 0 },
  { key: "quark", name: "Творог", weigh: "package", category: "dairy", kcal: 90, protein: 16, fat: 1.5, carbs: 3.5, fiber: 0 },
  { key: "yogurt", name: "Йогурт", weigh: "package", category: "dairy", kcal: 69, protein: 4.1, fat: 3, carbs: 4.7, fiber: 0 },
  { key: "feta", name: "Фета", weigh: "package", category: "dairy", kcal: 265, protein: 15, fat: 21, carbs: 2, fiber: 0 },
  { key: "sourCream", name: "Сметана", weigh: "package", category: "dairy", kcal: 160, protein: 2.6, fat: 15, carbs: 3.6, fiber: 0 },
  { key: "tomatoes", name: "Помидоры", weigh: "edible", category: "vegetables", kcal: 20, protein: 0.9, fat: 0.2, carbs: 3.5, fiber: 1.2 },
  { key: "cucumbers", name: "Огурцы", weigh: "edible", category: "vegetables", kcal: 14, protein: 0.7, fat: 0.1, carbs: 2.5, fiber: 0.5 },
  { key: "potatoes", name: "Картофель", weigh: "raw", category: "vegetables", kcal: 77, protein: 2, fat: 0.1, carbs: 17, fiber: 2 },
  { key: "peas", name: "Зелёный горошек", weigh: "edible", category: "vegetables", kcal: 81, protein: 5.4, fat: 0.4, carbs: 14, fiber: 5 },
  { key: "lettuce", name: "Листья салата", weigh: "edible", category: "vegetables", kcal: 15, protein: 1.4, fat: 0.2, carbs: 2, fiber: 1.3 },
  { key: "berries", name: "Ягоды", weigh: "edible", category: "fruit", kcal: 45, protein: 0.8, fat: 0.3, carbs: 9, fiber: 4 },
  { key: "apple", name: "Яблоко", weigh: "edible", category: "fruit", kcal: 52, protein: 0.3, fat: 0.2, carbs: 12, fiber: 2.4 },
  { key: "banana", name: "Банан", weigh: "edible", category: "fruit", kcal: 89, protein: 1.1, fat: 0.3, carbs: 23, fiber: 2.6 },
  { key: "orange", name: "Апельсин", weigh: "edible", category: "fruit", kcal: 47, protein: 0.9, fat: 0.1, carbs: 12, fiber: 2.4 },
  { key: "grapes", name: "Виноград", weigh: "edible", category: "fruit", kcal: 69, protein: 0.7, fat: 0.2, carbs: 18, fiber: 0.9 },
  { key: "oliveOil", name: "Оливковое масло", weigh: "package", category: "fats", kcal: 884, protein: 0, fat: 100, carbs: 0, fiber: 0 },
  { key: "nuts", name: "Орехи", weigh: "package", category: "fats", kcal: 650, protein: 17, fat: 60, carbs: 10, fiber: 7 },
  { key: "seeds", name: "Семечки", weigh: "package", category: "fats", kcal: 584, protein: 21, fat: 51, carbs: 20, fiber: 9 },
  { key: "peanutButter", name: "Арахисовая паста", weigh: "package", category: "fats", kcal: 590, protein: 25, fat: 50, carbs: 16, fiber: 6 },
];

/** [foodKey, husband g, wife g] */
type Row = [string, number, number];

export type MealSeed = {
  weekday: number; // 1 = Mon … 7 = Sun
  slot: MealSlot;
  title: string;
  items: Row[];
  /** The PDF's own totals, kcal [husband, wife] — used to verify the import. */
  pdfKcal: [number, number];
};

export const PLAN_MEALS: MealSeed[] = [
  // Day 1 — Monday
  { weekday: 1, slot: "breakfast", title: "Овсянка со Skyr, ягодами и орехами", pdfKcal: [438, 362],
    items: [["oats", 45, 30], ["skyr", 230, 200], ["berries", 120, 120], ["nuts", 10, 10]] },
  { weekday: 1, slot: "lunch", title: "Куриная грудка с гречкой и салатом", pdfKcal: [571, 425],
    items: [["chicken", 200, 155], ["buckwheat", 60, 45], ["tomatoes", 180, 180], ["cucumbers", 150, 150], ["oliveOil", 10, 5]] },
  { weekday: 1, slot: "dinner", title: "Чечевица с фетой", pdfKcal: [456, 360],
    items: [["lentils", 65, 45], ["feta", 50, 40], ["tomatoes", 200, 200], ["cucumbers", 100, 100], ["oliveOil", 5, 5]] },
  { weekday: 1, slot: "snack", title: "Skyr, яблоко и орехи", pdfKcal: [251, 222],
    items: [["skyr", 185, 155], ["apple", 140, 120], ["nuts", 10, 10]] },
  // Day 2 — Tuesday
  { weekday: 2, slot: "breakfast", title: "Яйца, хлеб, овощи и Skyr", pdfKcal: [412, 346],
    items: [["eggs", 85, 85], ["bread", 65, 45], ["tomatoes", 150, 150], ["cucumbers", 150, 150], ["skyr", 140, 110]] },
  { weekday: 2, slot: "lunch", title: "Лосось с картофелем и салатом", pdfKcal: [577, 472],
    items: [["salmon", 175, 140], ["potatoes", 235, 180], ["tomatoes", 150, 150], ["lettuce", 60, 60], ["oliveOil", 5, 5]] },
  { weekday: 2, slot: "dinner", title: "Курица с фасолью", pdfKcal: [532, 401],
    items: [["chicken", 185, 145], ["beans", 175, 135], ["tomatoes", 180, 180], ["cucumbers", 150, 150], ["oliveOil", 10, 5]] },
  { weekday: 2, slot: "snack", title: "Творог и апельсин", pdfKcal: [249, 205],
    items: [["quark", 185, 155], ["orange", 175, 140]] },
  // Day 3 — Wednesday
  { weekday: 3, slot: "breakfast", title: "Творог с бананом и овсянкой", pdfKcal: [464, 391],
    items: [["quark", 230, 185], ["banana", 95, 80], ["oats", 30, 25], ["seeds", 10, 10]] },
  { weekday: 3, slot: "lunch", title: "Курица с картофелем и горошком", pdfKcal: [601, 483],
    items: [["chicken", 195, 155], ["potatoes", 220, 165], ["peas", 105, 85], ["sourCream", 30, 20], ["oliveOil", 10, 10]] },
  { weekday: 3, slot: "dinner", title: "Салат с тунцом, фасолью и хлебом", pdfKcal: [548, 419],
    items: [["beans", 140, 110], ["tuna", 135, 100], ["bread", 70, 45], ["tomatoes", 180, 180], ["lettuce", 70, 70], ["oliveOil", 5, 5]] },
  { weekday: 3, slot: "snack", title: "Skyr с бананом", pdfKcal: [219, 175],
    items: [["skyr", 200, 165], ["banana", 105, 80]] },
  // Day 4 — Thursday
  { weekday: 4, slot: "breakfast", title: "Skyr, овсянка, яблоко и арахисовая паста", pdfKcal: [469, 381],
    items: [["skyr", 275, 230], ["oats", 45, 30], ["apple", 125, 120], ["peanutButter", 10, 10]] },
  { weekday: 4, slot: "lunch", title: "Сардины с гречкой и овощами", pdfKcal: [511, 402],
    items: [["sardines", 130, 100], ["buckwheat", 60, 45], ["tomatoes", 180, 180], ["cucumbers", 170, 170]] },
  { weekday: 4, slot: "dinner", title: "Омлет с картофелем и фетой", pdfKcal: [537, 436],
    items: [["eggs", 130, 85], ["potatoes", 205, 175], ["feta", 45, 40], ["tomatoes", 160, 160], ["oliveOil", 5, 5]] },
  { weekday: 4, slot: "snack", title: "Йогурт с ягодами и семечками", pdfKcal: [266, 209],
    items: [["yogurt", 160, 140], ["berries", 150, 120], ["seeds", 15, 10]] },
  // Day 5 — Friday
  { weekday: 5, slot: "breakfast", title: "Овсянка со Skyr и ягодами", pdfKcal: [438, 362],
    items: [["oats", 45, 30], ["skyr", 230, 200], ["berries", 120, 120], ["nuts", 10, 10]] },
  { weekday: 5, slot: "lunch", title: "Курица с гречкой", pdfKcal: [571, 425],
    items: [["chicken", 200, 155], ["buckwheat", 60, 45], ["tomatoes", 180, 180], ["cucumbers", 150, 150], ["oliveOil", 10, 5]] },
  { weekday: 5, slot: "dinner", title: "Пельмени со сметаной и овощами", pdfKcal: [615, 460],
    items: [["pelmeni", 175, 125], ["sourCream", 30, 20], ["tomatoes", 200, 200], ["cucumbers", 150, 150], ["skyr", 140, 110]] },
  { weekday: 5, slot: "snack", title: "Творог с апельсином", pdfKcal: [249, 205],
    items: [["quark", 185, 155], ["orange", 175, 140]] },
  // Day 6 — Saturday
  { weekday: 6, slot: "breakfast", title: "Яйца, хлеб, овощи и Skyr", pdfKcal: [412, 346],
    items: [["eggs", 85, 85], ["bread", 65, 45], ["tomatoes", 150, 150], ["cucumbers", 150, 150], ["skyr", 140, 110]] },
  { weekday: 6, slot: "lunch", title: "Чечевица с фетой", pdfKcal: [456, 360],
    items: [["lentils", 65, 45], ["feta", 50, 40], ["tomatoes", 200, 200], ["cucumbers", 100, 100], ["oliveOil", 5, 5]] },
  { weekday: 6, slot: "dinner", title: "Лосось с картофелем", pdfKcal: [577, 472],
    items: [["salmon", 175, 140], ["potatoes", 235, 180], ["tomatoes", 150, 150], ["lettuce", 60, 60], ["oliveOil", 5, 5]] },
  { weekday: 6, slot: "snack", title: "Творог с виноградом", pdfKcal: [249, 198],
    items: [["quark", 185, 155], ["grapes", 120, 85]] },
  // Day 7 — Sunday
  { weekday: 7, slot: "breakfast", title: "Творог с бананом и овсянкой", pdfKcal: [464, 391],
    items: [["quark", 230, 185], ["banana", 95, 80], ["oats", 30, 25], ["seeds", 10, 10]] },
  { weekday: 7, slot: "lunch", title: "Курица с картофелем и горошком", pdfKcal: [601, 483],
    items: [["chicken", 195, 155], ["potatoes", 220, 165], ["peas", 105, 85], ["sourCream", 30, 20], ["oliveOil", 10, 10]] },
  { weekday: 7, slot: "dinner", title: "Курица с фасолью", pdfKcal: [532, 401],
    items: [["chicken", 185, 145], ["beans", 175, 135], ["tomatoes", 180, 180], ["cucumbers", 150, 150], ["oliveOil", 10, 5]] },
  { weekday: 7, slot: "snack", title: "Skyr с яблоком и орехами", pdfKcal: [251, 222],
    items: [["skyr", 185, 155], ["apple", 140, 120], ["nuts", 10, 10]] },
];

/** Daily targets from section 1 of the plan. */
export const PLAN_TARGETS = {
  husband: { kcal: 1800, proteinMin: 130, proteinMax: 160, fatMin: 50, fatMax: 65 },
  wife: { kcal: 1450, proteinMin: 95, proteinMax: 125, fatMin: 40, fatMax: 55 },
} as const;

/** Lifestyle habits from sections 8–9 (created on import if requested). */
export const PLAN_HABITS = {
  water: { husband: 2.25, wife: 1.75 },
  /** Week-1 step target; the plan raises it weekly (2 500 → 7 000 by week 8). */
  steps: 2500,
  /** Strength training on Mon + Thu. */
  strengthWeekdays: [1, 4],
} as const;

export const PLAN_NOTES = `Правила взвешивания
С — сухой вес до варки (овсянка, гречка, чечевица)
Р — сырой вес до приготовления (мясо, рыба, очищенный картофель)
У — вес из упаковки (молочные продукты, хлеб, фета, пельмени, масло, орехи)
Б — после слива жидкости (консервы, фасоль)
О — съедобная часть овощей, фруктов и ягод
Я — вес яиц без скорлупы (85 г ≈ 1,5 яйца, 130 г ≈ 2,5 яйца)
Курица — грудка без кожи; тунец — в собственном соку. Показатели на упаковке имеют приоритет.

Готовка на 2–3 дня
Готовьте ингредиенты раздельно: заранее запекайте курицу, отваривайте гречку и картофель; помидоры и огурцы режьте перед подачей. Калорийность считайте по сырому/сухому весу, а фактический вес готовой партии делите на порции пропорционально исходным граммам. Готовое быстро охлаждайте и храните в холодильнике не дольше 3–4 дней.

Непереносимость лактозы
Творог, Skyr, йогурт и сметану при симптомах выбирайте laktosefrei. Фета может содержать лактозу.

Шаги по неделям: 2 500 → 3 000 → 3 500 → 4 000 → 5 000 → 5 500 → 6 500 → 7 000.
Силовая 2 раза в неделю по 20–30 минут (пн и чт): приседания, отжимания от стены, ягодичный мост, тяга гантели, планка.
Вода: муж ≈2–2,5 л, жена ≈1,5–2 л. Сон 7–9 часов.`;
