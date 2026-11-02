import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canWrite } from "@/lib/auth/household";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import type {
  CreateShoppingItemInput,
  UpdateShoppingItemInput,
} from "@/lib/validations/shopping";
import { loadMealPlanView, shoppingText } from "@/services/meal-service";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "DB";
  message: string;
};

export type ShoppingItem =
  Database["public"]["Tables"]["shopping_items"]["Row"];

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

const CATEGORY_LABEL: Record<string, string> = {
  meat_fish: "Мясо и рыба",
  dairy: "Молочка",
  grains: "Крупы и хлеб",
  vegetables: "Овощи",
  fruit: "Фрукты",
  fats: "Масла и соусы",
  other: "Другое",
};

export async function listShoppingItems(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{ data: ShoppingItem[] | null; error: ServiceError | null }> {
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("shopping_items")
      .select("*")
      .eq("household_id", ctx.householdId)
      .order("is_done", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) return { data: null, error: err("DB", error.message) };
  return { data: data ?? [], error: null };
}

export async function createShoppingItem(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: CreateShoppingItemInput,
): Promise<{ data: ShoppingItem | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { data: null, error: err("FORBIDDEN", "Нет прав добавлять покупки") };
  }

  const { data: maxRow } = await supabase
    .from("shopping_items")
    .select("sort_order")
    .eq("household_id", ctx.householdId)
    .eq("is_done", false)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("shopping_items")
    .insert({
      household_id: ctx.householdId,
      title: input.title.trim(),
      note: input.note?.trim() || null,
      sort_order: (maxRow?.sort_order ?? 0) + 1,
      source: "manual",
      created_by: ctx.user.id,
    })
    .select("*")
    .single();

  if (error) return { data: null, error: err("DB", error.message) };
  return { data, error: null };
}

export async function updateShoppingItem(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  id: string,
  input: UpdateShoppingItemInput,
): Promise<{ data: ShoppingItem | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { data: null, error: err("FORBIDDEN", "Нет прав менять покупки") };
  }

  const patch: Database["public"]["Tables"]["shopping_items"]["Update"] = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.note !== undefined) patch.note = input.note?.trim() || null;
  if (input.isDone !== undefined) patch.is_done = input.isDone;

  const { data, error } = await supabase
    .from("shopping_items")
    .update(patch)
    .eq("household_id", ctx.householdId)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return { data: null, error: err("DB", error.message) };
  if (!data) return { data: null, error: err("NOT_FOUND", "Позиция не найдена") };
  return { data, error: null };
}

export async function deleteShoppingItem(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  id: string,
): Promise<{ error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { error: err("FORBIDDEN", "Нет прав удалять покупки") };
  }
  const { error, count } = await supabase
    .from("shopping_items")
    .delete({ count: "exact" })
    .eq("household_id", ctx.householdId)
    .eq("id", id);
  if (error) return { error: err("DB", error.message) };
  if (!count) return { error: err("NOT_FOUND", "Позиция не найдена") };
  return { error: null };
}

export async function clearDoneShoppingItems(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{ deleted: number; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { deleted: 0, error: err("FORBIDDEN", "Нет прав чистить список") };
  }
  const { error, count } = await supabase
    .from("shopping_items")
    .delete({ count: "exact" })
    .eq("household_id", ctx.householdId)
    .eq("is_done", true);
  if (error) return { deleted: 0, error: err("DB", error.message) };
  return { deleted: count ?? 0, error: null };
}

/**
 * Append open meal-plan shopping lines that are not already on the list
 * (case-insensitive title match among open items).
 */
export async function importMealPlanShopping(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{ added: number; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { added: 0, error: err("FORBIDDEN", "Нет прав добавлять покупки") };
  }

  const view = await loadMealPlanView(supabase, ctx);
  if (view.error || !view.data) {
    return {
      added: 0,
      error: view.error ?? err("DB", "Не удалось загрузить план питания"),
    };
  }
  if (view.data.shopping.length === 0) {
    return { added: 0, error: err("VALIDATION", "В плане питания пока нечего покупать") };
  }

  const existing = await listShoppingItems(supabase, ctx);
  if (existing.error) return { added: 0, error: existing.error };
  const openTitles = new Set(
    (existing.data ?? [])
      .filter((item) => !item.is_done)
      .map((item) => item.title.trim().toLowerCase()),
  );

  const { data: maxRow } = await supabase
    .from("shopping_items")
    .select("sort_order")
    .eq("household_id", ctx.householdId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let sort = maxRow?.sort_order ?? 0;

  const rows: Database["public"]["Tables"]["shopping_items"]["Insert"][] = [];
  for (const group of view.data.shopping) {
    for (const line of group.lines) {
      const grams = Math.round(line.grams);
      const title = `${line.food.name} — ${grams} г`;
      const key = title.toLowerCase();
      if (openTitles.has(key)) continue;
      openTitles.add(key);
      sort += 1;
      rows.push({
        household_id: ctx.householdId,
        title,
        note: CATEGORY_LABEL[group.category] ?? group.category,
        sort_order: sort,
        source: "meal_plan",
        created_by: ctx.user.id,
      });
    }
  }

  if (rows.length === 0) {
    return { added: 0, error: null };
  }

  const { error } = await supabase.from("shopping_items").insert(rows);
  if (error) return { added: 0, error: err("DB", error.message) };
  return { added: rows.length, error: null };
}

export function shoppingListPlainText(items: ShoppingItem[]): string {
  const open = items.filter((item) => !item.is_done);
  if (open.length === 0) return "";
  return open.map((item) => `☐ ${item.title}${item.note ? ` (${item.note})` : ""}`).join("\n");
}

/** Re-export meal shopping dump for the meals tab copy button. */
export { shoppingText };
