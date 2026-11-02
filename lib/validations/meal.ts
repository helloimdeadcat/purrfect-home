import { z } from "zod";

const weighMode = z.enum(["dry", "raw", "package", "drained", "edible", "shelled"]);
const category = z.enum(["meat_fish", "dairy", "grains", "vegetables", "fruit", "fats", "other"]);
const slot = z.enum(["breakfast", "lunch", "dinner", "snack"]);
/** Accepts "12,5" from the form as well as numbers. */
const per100 = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v),
    z.number().min(0).max(max),
  );

export const foodSchema = z.object({
  name: z.string().trim().min(1, "Нужно название").max(80),
  weighMode: weighMode.nullable().optional(),
  category: category.default("other"),
  kcal: per100(950),
  protein: per100(100),
  fat: per100(100),
  carbs: per100(100),
  fiber: per100(100).default(0),
  gramsPerPiece: z.number().positive().max(5000).nullable().optional(),
  pieceLabel: z.string().trim().max(20).nullable().optional(),
});

export const updateFoodSchema = foodSchema.partial();

export const createMealSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  slot,
  title: z.string().trim().min(1, "Нужно название блюда").max(160),
});

export const updateMealSchema = createMealSchema.partial().refine(
  (value) => Object.values(value).some((entry) => entry !== undefined),
  { message: "Нет изменений" },
);

/** Set one food's grams for each person in a meal; 0 removes that person's portion. */
export const setPortionsSchema = z.object({
  mealId: z.uuid(),
  foodId: z.uuid(),
  grams: z
    .array(z.object({ memberId: z.uuid(), grams: z.number().min(0).max(5000) }))
    .min(1)
    .max(10),
});

export const updatePlanSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    notes: z.string().max(8000).nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.notes !== undefined, {
    message: "Нет изменений",
  });

const optionalInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable().optional();

export const nutritionTargetSchema = z
  .object({
    memberId: z.uuid(),
    kcal: optionalInt(500, 6000),
    proteinMin: optionalInt(0, 500),
    proteinMax: optionalInt(0, 500),
    fatMin: optionalInt(0, 400),
    fatMax: optionalInt(0, 400),
  })
  .refine((v) => v.proteinMin == null || v.proteinMax == null || v.proteinMin <= v.proteinMax, {
    message: "Минимум белка не может быть больше максимума",
    path: ["proteinMax"],
  })
  .refine((v) => v.fatMin == null || v.fatMax == null || v.fatMin <= v.fatMax, {
    message: "Минимум жиров не может быть больше максимума",
    path: ["fatMax"],
  });

export const importPlanSchema = z
  .object({
    husbandMemberId: z.uuid(),
    wifeMemberId: z.uuid(),
    createHabits: z.boolean().default(true),
  })
  .refine((v) => v.husbandMemberId !== v.wifeMemberId, {
    message: "Выбери двух разных людей",
    path: ["wifeMemberId"],
  });

export type FoodInput = z.infer<typeof foodSchema>;
export type UpdateFoodInput = z.infer<typeof updateFoodSchema>;
export type CreateMealInput = z.infer<typeof createMealSchema>;
export type UpdateMealInput = z.infer<typeof updateMealSchema>;
export type SetPortionsInput = z.infer<typeof setPortionsSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type NutritionTargetInput = z.infer<typeof nutritionTargetSchema>;
export type ImportPlanInput = z.infer<typeof importPlanSchema>;
