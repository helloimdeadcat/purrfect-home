import type { SupabaseClient } from "@supabase/supabase-js";

import type { CategoryType, Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type CategoryOption = {
  id: string;
  name: string;
  type: CategoryType;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
};

export async function listHouseholdCategories(
  supabase: AppSupabase,
  householdId: string,
) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, type, parent_id, sort_order, is_active")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return { data: null as CategoryOption[] | null, error: error.message };
  }

  return { data: (data ?? []) as CategoryOption[], error: null };
}

/** Expense categories suitable for monthly category budgets. */
export async function listExpenseCategoriesForBudgets(
  supabase: AppSupabase,
  householdId: string,
) {
  const { data, error } = await listHouseholdCategories(supabase, householdId);
  if (error || !data) {
    return { data: null as CategoryOption[] | null, error };
  }

  return {
    data: data.filter(
      (category) => category.type === "expense" || category.type === "both",
    ),
    error: null,
  };
}
