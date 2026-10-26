import type { MealSlot, ShoppingCategory, WeighMode } from "@/types/database";

export const SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export const SLOT_EMOJI: Record<MealSlot, string> = {
  breakfast: "🥣",
  lunch: "🍲",
  dinner: "🍽️",
  snack: "🍎",
};

/** Short code as used in the plan (С, Р, У, Б, О, Я) + explanation. */
export const WEIGH_LABEL: Record<WeighMode, { code: string; text: string }> = {
  dry: { code: "С", text: "dry weight before cooking" },
  raw: { code: "Р", text: "raw weight before cooking" },
  package: { code: "У", text: "as packaged" },
  drained: { code: "Б", text: "drained" },
  edible: { code: "О", text: "edible part" },
  shelled: { code: "Я", text: "without shell" },
};

export const CATEGORY_LABEL: Record<ShoppingCategory, string> = {
  meat_fish: "Meat, fish & eggs",
  dairy: "Dairy",
  grains: "Grains, legumes & bread",
  vegetables: "Vegetables",
  fruit: "Fruit & berries",
  fats: "Oils, nuts & extras",
  other: "Other",
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
