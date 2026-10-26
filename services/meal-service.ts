import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canWrite } from "@/lib/auth/household";
import {
  aggregateShopping,
  formatGrams,
  totalsByMember,
  ZERO_MACROS,
  type Macros,
  type Portion,
} from "@/lib/calculations/nutrition";
import { isoWeekday } from "@/lib/calculations/task-schedule";
import { CATEGORY_ORDER, SLOT_ORDER } from "@/lib/meals/labels";
import {
  PLAN_FOODS,
  PLAN_HABITS,
  PLAN_MEALS,
  PLAN_NOTES,
  PLAN_TARGETS,
} from "@/lib/meals/seven-day-plan";
import { buildPeople } from "@/lib/people";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import type {
  CreateMealInput,
  FoodInput,
  ImportPlanInput,
  NutritionTargetInput,
  SetPortionsInput,
  UpdateFoodInput,
  UpdateMealInput,
  UpdatePlanInput,
} from "@/lib/validations/meal";
import { listFamilyMembers } from "@/services/family-service";
import { getHouseholdToday } from "@/services/settings-service";
import { createTask } from "@/services/task-service";
import type { Database, ShoppingCategory } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;
type Tables = Database["public"]["Tables"];

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB" | "CONFLICT";
  message: string;
};

export type FoodRow = Tables["foods"]["Row"];
export type MealRow = Tables["meal_plan_meals"]["Row"];
export type PortionRow = Tables["meal_plan_portions"]["Row"];
export type MealPlanRow = Tables["meal_plans"]["Row"];
export type TargetRow = Tables["nutrition_targets"]["Row"];

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

export function foodMacros(food: FoodRow): Macros {
  return {
    kcal: Number(food.kcal),
    protein: Number(food.protein),
    fat: Number(food.fat),
    carbs: Number(food.carbs),
    fiber: Number(food.fiber),
  };
}

function toPortion(row: PortionRow): Portion {
  return { foodId: row.food_id, memberId: row.member_id, grams: Number(row.grams) };
}

export type MealPlanView = {
  today: string;
  todayWeekday: number;
  plan: MealPlanRow | null;
  foods: FoodRow[];
  people: ReturnType<typeof buildPeople>;
  meals: MealRow[];
  portionsByMeal: Record<string, PortionRow[]>;
  /** mealId → memberId → macros */
  mealTotals: Record<string, Record<string, Macros>>;
  /** weekday → memberId → macros */
  dayTotals: Record<number, Record<string, Macros>>;
  targets: Record<string, TargetRow>;
  shopping: { category: ShoppingCategory; lines: { food: FoodRow; grams: number }[] }[];
  canEdit: boolean;
};

function toRecord(map: Map<string, Macros>): Record<string, Macros> {
  return Object.fromEntries(map.entries());
}

export async function loadMealPlanView(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{ data: MealPlanView | null; error: ServiceError | null }> {
  const [{ today }, planResult, foodsResult, targetsResult, membersResult] = await Promise.all([
    getHouseholdToday(supabase, ctx),
    supabase
      .from("meal_plans")
      .select("*")
      .eq("household_id", ctx.householdId)
      .eq("is_active", true)
      .maybeSingle(),
    fetchAllPages((from, to) =>
      supabase
        .from("foods")
        .select("*")
        .eq("household_id", ctx.householdId)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    supabase.from("nutrition_targets").select("*").eq("household_id", ctx.householdId),
    listFamilyMembers(supabase, ctx),
  ]);
  if (planResult.error) return { data: null, error: err("DB", planResult.error.message) };
  if (foodsResult.error) return { data: null, error: err("DB", foodsResult.error.message) };
  if (targetsResult.error) return { data: null, error: err("DB", targetsResult.error.message) };

  const plan = planResult.data;
  let meals: MealRow[] = [];
  const portions: PortionRow[] = [];
  if (plan) {
    const mealsResult = await supabase
      .from("meal_plan_meals")
      .select("*")
      .eq("household_id", ctx.householdId)
      .eq("plan_id", plan.id);
    if (mealsResult.error) return { data: null, error: err("DB", mealsResult.error.message) };
    meals = (mealsResult.data ?? []).sort(
      (a, b) =>
        a.weekday - b.weekday ||
        SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) ||
        a.position - b.position,
    );
    // Chunked .in() keeps the request URL short for big plans.
    const ids = meals.map((m) => m.id);
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const result = await fetchAllPages((from, to) =>
        supabase
          .from("meal_plan_portions")
          .select("*")
          .eq("household_id", ctx.householdId)
          .in("meal_id", chunk)
          .order("id", { ascending: true })
          .range(from, to),
      );
      if (result.error) return { data: null, error: err("DB", result.error.message) };
      portions.push(...(result.data ?? []));
    }
  }

  const foods = foodsResult.data ?? [];
  const foodValues = new Map(foods.map((f) => [f.id, foodMacros(f)]));
  const portionsByMeal: Record<string, PortionRow[]> = {};
  for (const p of portions) (portionsByMeal[p.meal_id] ??= []).push(p);

  const mealTotals: Record<string, Record<string, Macros>> = {};
  const dayTotals: Record<number, Record<string, Macros>> = {};
  for (const meal of meals) {
    const totals = totalsByMember((portionsByMeal[meal.id] ?? []).map(toPortion), foodValues);
    mealTotals[meal.id] = toRecord(totals);
    const day = (dayTotals[meal.weekday] ??= {});
    for (const [memberId, m] of totals) {
      const prev = day[memberId] ?? ZERO_MACROS;
      day[memberId] = {
        kcal: prev.kcal + m.kcal,
        protein: prev.protein + m.protein,
        fat: prev.fat + m.fat,
        carbs: prev.carbs + m.carbs,
        fiber: prev.fiber + m.fiber,
      };
    }
  }

  const foodById = new Map(foods.map((f) => [f.id, f]));
  const shoppingLines = aggregateShopping(portions.map(toPortion));
  const shopping = CATEGORY_ORDER.map((category) => ({
    category,
    lines: shoppingLines
      .map((line) => ({ food: foodById.get(line.foodId)!, grams: line.grams }))
      .filter((line) => line.food && line.food.shopping_category === category)
      .sort((a, b) => b.grams - a.grams),
  })).filter((group) => group.lines.length > 0);

  return {
    data: {
      today,
      todayWeekday: isoWeekday(today),
      plan,
      foods,
      people: buildPeople(membersResult.data ?? [], ctx.user.id),
      meals,
      portionsByMeal,
      mealTotals,
      dayTotals,
      targets: Object.fromEntries((targetsResult.data ?? []).map((t) => [t.member_id, t])),
      shopping,
      canEdit: canWrite(ctx.role),
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function forbid(ctx: HouseholdContext): ServiceError | null {
  return canWrite(ctx.role) ? null : err("FORBIDDEN", "Viewers cannot edit the meal plan");
}

async function activePlanId(supabase: AppSupabase, ctx: HouseholdContext): Promise<string | null> {
  const { data } = await supabase
    .from("meal_plans")
    .select("id")
    .eq("household_id", ctx.householdId)
    .eq("is_active", true)
    .maybeSingle();
  return data?.id ?? null;
}

function foodColumns(input: Partial<FoodInput>): Tables["foods"]["Update"] {
  const patch: Tables["foods"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.weighMode !== undefined) patch.weigh_mode = input.weighMode;
  if (input.category !== undefined) patch.shopping_category = input.category;
  if (input.kcal !== undefined) patch.kcal = input.kcal;
  if (input.protein !== undefined) patch.protein = input.protein;
  if (input.fat !== undefined) patch.fat = input.fat;
  if (input.carbs !== undefined) patch.carbs = input.carbs;
  if (input.fiber !== undefined) patch.fiber = input.fiber;
  if (input.gramsPerPiece !== undefined) patch.grams_per_piece = input.gramsPerPiece;
  if (input.pieceLabel !== undefined) patch.piece_label = input.pieceLabel || null;
  return patch;
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function createFood(supabase: AppSupabase, ctx: HouseholdContext, input: FoodInput) {
  const denied = forbid(ctx);
  if (denied) return { data: null, error: denied };
  const { data, error } = await supabase
    .from("foods")
    .insert({ household_id: ctx.householdId, name: input.name, ...foodColumns(input) })
    .select("*")
    .single();
  if (isUniqueViolation(error)) return { data: null, error: err("CONFLICT", "A food with this name already exists") };
  if (error || !data) return { data: null, error: err("DB", error?.message ?? "Failed to add food") };
  return { data, error: null };
}

export async function updateFood(supabase: AppSupabase, ctx: HouseholdContext, foodId: string, input: UpdateFoodInput) {
  const denied = forbid(ctx);
  if (denied) return { data: null, error: denied };
  const { data, error } = await supabase
    .from("foods")
    .update(foodColumns(input))
    .eq("id", foodId)
    .eq("household_id", ctx.householdId)
    .select("*")
    .maybeSingle();
  if (isUniqueViolation(error)) return { data: null, error: err("CONFLICT", "A food with this name already exists") };
  if (error) return { data: null, error: err("DB", error.message) };
  if (!data) return { data: null, error: err("NOT_FOUND", "Food not found") };
  return { data, error: null };
}

export async function deleteFood(supabase: AppSupabase, ctx: HouseholdContext, foodId: string) {
  const denied = forbid(ctx);
  if (denied) return { error: denied };
  const { error } = await supabase.from("foods").delete().eq("id", foodId).eq("household_id", ctx.householdId);
  if (error?.code === "23503") {
    return { error: err("CONFLICT", "This food is used in the meal plan — remove it from meals first") };
  }
  if (error) return { error: err("DB", error.message) };
  return { error: null };
}

export async function createEmptyPlan(supabase: AppSupabase, ctx: HouseholdContext, name = "Our meal plan") {
  const denied = forbid(ctx);
  if (denied) return { data: null, error: denied };
  if (await activePlanId(supabase, ctx)) {
    return { data: null, error: err("CONFLICT", "There is already an active plan") };
  }
  const { data, error } = await supabase
    .from("meal_plans")
    .insert({ household_id: ctx.householdId, name, created_by: ctx.user.id })
    .select("*")
    .single();
  if (error || !data) return { data: null, error: err("DB", error?.message ?? "Failed to create plan") };
  return { data, error: null };
}

export async function updatePlan(supabase: AppSupabase, ctx: HouseholdContext, planId: string, input: UpdatePlanInput) {
  const denied = forbid(ctx);
  if (denied) return { error: denied };
  const patch: Tables["meal_plans"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.notes !== undefined) patch.notes = input.notes || null;
  const { error } = await supabase.from("meal_plans").update(patch).eq("id", planId).eq("household_id", ctx.householdId);
  if (error) return { error: err("DB", error.message) };
  return { error: null };
}

export async function createMeal(supabase: AppSupabase, ctx: HouseholdContext, input: CreateMealInput) {
  const denied = forbid(ctx);
  if (denied) return { data: null, error: denied };
  const planId = await activePlanId(supabase, ctx);
  if (!planId) return { data: null, error: err("NOT_FOUND", "Create a meal plan first") };
  const { data, error } = await supabase
    .from("meal_plan_meals")
    .insert({ plan_id: planId, household_id: ctx.householdId, ...input })
    .select("*")
    .single();
  if (error || !data) return { data: null, error: err("DB", error?.message ?? "Failed to add meal") };
  return { data, error: null };
}

export async function updateMeal(supabase: AppSupabase, ctx: HouseholdContext, mealId: string, input: UpdateMealInput) {
  const denied = forbid(ctx);
  if (denied) return { error: denied };
  const { error } = await supabase
    .from("meal_plan_meals")
    .update(input)
    .eq("id", mealId)
    .eq("household_id", ctx.householdId);
  if (error) return { error: err("DB", error.message) };
  return { error: null };
}

export async function deleteMeal(supabase: AppSupabase, ctx: HouseholdContext, mealId: string) {
  const denied = forbid(ctx);
  if (denied) return { error: denied };
  const { error } = await supabase.from("meal_plan_meals").delete().eq("id", mealId).eq("household_id", ctx.householdId);
  if (error) return { error: err("DB", error.message) };
  return { error: null };
}

/** Set one food's grams per person in a meal; 0 removes that person's portion. */
export async function setPortions(supabase: AppSupabase, ctx: HouseholdContext, input: SetPortionsInput) {
  const denied = forbid(ctx);
  if (denied) return { error: denied };

  const keep = input.grams.filter((g) => g.grams > 0);
  const drop = input.grams.filter((g) => g.grams === 0).map((g) => g.memberId);

  if (keep.length > 0) {
    const { error } = await supabase.from("meal_plan_portions").upsert(
      keep.map((g) => ({
        meal_id: input.mealId,
        household_id: ctx.householdId,
        food_id: input.foodId,
        member_id: g.memberId,
        grams: Math.round(g.grams * 10) / 10,
      })),
      { onConflict: "meal_id,food_id,member_id" },
    );
    if (error) return { error: err("DB", error.message) };
  }
  if (drop.length > 0) {
    const { error } = await supabase
      .from("meal_plan_portions")
      .delete()
      .eq("household_id", ctx.householdId)
      .eq("meal_id", input.mealId)
      .eq("food_id", input.foodId)
      .in("member_id", drop);
    if (error) return { error: err("DB", error.message) };
  }
  return { error: null };
}

export async function upsertNutritionTarget(supabase: AppSupabase, ctx: HouseholdContext, input: NutritionTargetInput) {
  const denied = forbid(ctx);
  if (denied) return { error: denied };
  const { error } = await supabase.from("nutrition_targets").upsert(
    {
      member_id: input.memberId,
      household_id: ctx.householdId,
      kcal: input.kcal ?? null,
      protein_min: input.proteinMin ?? null,
      protein_max: input.proteinMax ?? null,
      fat_min: input.fatMin ?? null,
      fat_max: input.fatMax ?? null,
    },
    { onConflict: "member_id" },
  );
  if (error) return { error: err("DB", error.message) };
  return { error: null };
}

/** "Куриная грудка — 2.07 kg" / "Яйца — 510 g (≈9 egg)" lines grouped by category. */
export function shoppingText(view: Pick<MealPlanView, "shopping">, labels: Record<ShoppingCategory, string>): string {
  return view.shopping
    .map((group) => {
      const lines = group.lines.map(({ food, grams }) => {
        const piece = food.grams_per_piece ? Number(food.grams_per_piece) : null;
        const pieces = piece ? ` (≈${Math.ceil(grams / piece)} ${food.piece_label ?? "pcs"})` : "";
        return `• ${food.name} — ${formatGrams(grams)}${pieces}`;
      });
      return `${labels[group.category]}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

/** Put the week's shopping list into the shared to-do list. */
export async function createShoppingTask(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  labels: Record<ShoppingCategory, string>,
) {
  const denied = forbid(ctx);
  if (denied) return { data: null, error: denied };
  const view = await loadMealPlanView(supabase, ctx);
  if (view.error || !view.data) return { data: null, error: view.error };
  if (view.data.shopping.length === 0) {
    return { data: null, error: err("VALIDATION", "The plan has no ingredients yet") };
  }
  const notes = `${shoppingText(view.data, labels)}\n\nAmounts are net (raw/dry/edible) — buy a little extra for peel and trimming.`;
  return createTask(supabase, ctx, {
    title: "Groceries for the week 🛒",
    notes: notes.slice(0, 2000),
    assigneeMemberId: null,
    startDate: view.data.today,
    repeat: { kind: "none" },
  });
}

/**
 * Import the household's 7-day plan: reuse foods with the same name, make
 * the new plan the active one, map the plan's "husband"/"wife" columns to
 * real members, set their targets and optionally create the lifestyle
 * habits. Not atomic across requests: a failure removes the half-built plan
 * and re-activates the previous one.
 */
export async function importSevenDayPlan(supabase: AppSupabase, ctx: HouseholdContext, input: ImportPlanInput) {
  const denied = forbid(ctx);
  if (denied) return { data: null, error: denied };

  const members = await listFamilyMembers(supabase, ctx);
  const memberIds = new Set((members.data ?? []).map((m) => m.id));
  if (!memberIds.has(input.husbandMemberId) || !memberIds.has(input.wifeMemberId)) {
    return { data: null, error: err("VALIDATION", "Pick two members of this household") };
  }

  // Foods: reuse by (case-insensitive) name, insert the rest.
  const { data: existing, error: foodsError } = await supabase
    .from("foods")
    .select("id, name")
    .eq("household_id", ctx.householdId);
  if (foodsError) return { data: null, error: err("DB", foodsError.message) };
  const byName = new Map((existing ?? []).map((f) => [f.name.trim().toLowerCase(), f.id]));
  const missing = PLAN_FOODS.filter((f) => !byName.has(f.name.toLowerCase()));
  if (missing.length > 0) {
    const { data: inserted, error } = await supabase
      .from("foods")
      .insert(
        missing.map((f) => ({
          household_id: ctx.householdId,
          name: f.name,
          weigh_mode: f.weigh,
          shopping_category: f.category,
          kcal: f.kcal,
          protein: f.protein,
          fat: f.fat,
          carbs: f.carbs,
          fiber: f.fiber,
          grams_per_piece: f.gramsPerPiece ?? null,
          piece_label: f.pieceLabel ?? null,
        })),
      )
      .select("id, name");
    if (error) return { data: null, error: err("DB", error.message) };
    for (const f of inserted ?? []) byName.set(f.name.trim().toLowerCase(), f.id);
  }
  const foodId = (key: string) => byName.get(PLAN_FOODS.find((f) => f.key === key)!.name.toLowerCase())!;

  // Swap the active plan.
  const previousId = await activePlanId(supabase, ctx);
  if (previousId) {
    const { error } = await supabase.from("meal_plans").update({ is_active: false }).eq("id", previousId);
    if (error) return { data: null, error: err("DB", error.message) };
  }
  const { data: plan, error: planError } = await supabase
    .from("meal_plans")
    .insert({
      household_id: ctx.householdId,
      name: "План питания на 7 дней",
      notes: PLAN_NOTES,
      created_by: ctx.user.id,
    })
    .select("*")
    .single();
  if (planError || !plan) {
    if (previousId) await supabase.from("meal_plans").update({ is_active: true }).eq("id", previousId);
    return { data: null, error: err("DB", planError?.message ?? "Failed to create plan") };
  }

  const rollback = async (message: string) => {
    await supabase.from("meal_plans").delete().eq("id", plan.id);
    if (previousId) await supabase.from("meal_plans").update({ is_active: true }).eq("id", previousId);
    return { data: null, error: err("DB", message) };
  };

  const { data: meals, error: mealsError } = await supabase
    .from("meal_plan_meals")
    .insert(
      PLAN_MEALS.map((m) => ({
        plan_id: plan.id,
        household_id: ctx.householdId,
        weekday: m.weekday,
        slot: m.slot,
        title: m.title,
      })),
    )
    .select("id, weekday, slot");
  if (mealsError || !meals) return rollback(mealsError?.message ?? "Failed to add meals");

  const mealId = new Map(meals.map((m) => [`${m.weekday}:${m.slot}`, m.id]));
  const portions = PLAN_MEALS.flatMap((m) =>
    m.items.flatMap(([key, husband, wife]) => [
      { meal_id: mealId.get(`${m.weekday}:${m.slot}`)!, household_id: ctx.householdId, food_id: foodId(key), member_id: input.husbandMemberId, grams: husband },
      { meal_id: mealId.get(`${m.weekday}:${m.slot}`)!, household_id: ctx.householdId, food_id: foodId(key), member_id: input.wifeMemberId, grams: wife },
    ]),
  );
  const { error: portionsError } = await supabase.from("meal_plan_portions").insert(portions);
  if (portionsError) return rollback(portionsError.message);

  for (const [memberId, t] of [
    [input.husbandMemberId, PLAN_TARGETS.husband],
    [input.wifeMemberId, PLAN_TARGETS.wife],
  ] as const) {
    await upsertNutritionTarget(supabase, ctx, {
      memberId,
      kcal: t.kcal,
      proteinMin: t.proteinMin,
      proteinMax: t.proteinMax,
      fatMin: t.fatMin,
      fatMax: t.fatMax,
    });
  }

  let habitsCreated = 0;
  if (input.createHabits) {
    const { today } = await getHouseholdToday(supabase, ctx);
    const base = { household_id: ctx.householdId, start_date: today, created_by: ctx.user.id };
    const { data: habits } = await supabase
      .from("habits")
      .insert([
        { ...base, title: "Вода", emoji: "💧", owner_member_id: input.husbandMemberId, goal_kind: "count", target: PLAN_HABITS.water.husband, unit: "л", frequency: "daily" },
        { ...base, title: "Вода", emoji: "💧", owner_member_id: input.wifeMemberId, goal_kind: "count", target: PLAN_HABITS.water.wife, unit: "л", frequency: "daily" },
        { ...base, title: "Шаги", emoji: "👟", owner_member_id: null, goal_kind: "count", target: PLAN_HABITS.steps, unit: "шагов", frequency: "daily" },
        { ...base, title: "Силовая 20–30 мин", emoji: "💪", owner_member_id: null, goal_kind: "check", target: 1, frequency: "days", weekdays: [...PLAN_HABITS.strengthWeekdays] },
      ])
      .select("id");
    habitsCreated = habits?.length ?? 0;
  }

  return { data: { planId: plan.id, meals: meals.length, portions: portions.length, habitsCreated }, error: null };
}
