import type { MealSlot, ShoppingCategory, WeighMode } from "@/types/database";

export const SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

export const SLOT_EMOJI: Record<MealSlot, string> = {
  breakfast: "🥣",
  lunch: "🍲",
  dinner: "🍽️",
  snack: "🍎",
};

/** Short code as used in the plan (С, Р, У, Б, О, Я) + explanation. */
export const WEIGH_LABEL: Record<WeighMode, { code: string; text: string }> = {
  dry: { code: "С", text: "сухой вес до варки" },
  raw: { code: "Р", text: "сырой вес до готовки" },
  package: { code: "У", text: "вес по упаковке" },
  drained: { code: "Б", text: "без жидкости" },
  edible: { code: "О", text: "съедобная часть" },
  shelled: { code: "Я", text: "без скорлупы" },
};

export const CATEGORY_LABEL: Record<ShoppingCategory, string> = {
  meat_fish: "Мясо, рыба и яйца",
  dairy: "Молочное",
  grains: "Крупы, бобовые и хлеб",
  vegetables: "Овощи",
  fruit: "Фрукты и ягоды",
  fats: "Масла, орехи и прочее",
  other: "Другое",
};

export const CATEGORY_ORDER: ShoppingCategory[] = [
  "meat_fish",
  "dairy",
  "grains",
  "vegetables",
  "fruit",
  "fats",
  "other",
];
