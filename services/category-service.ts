import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin, canWrite } from "@/lib/auth/household";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/lib/validations/settings";
import type { CategoryType, Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB" | "CONFLICT";
  message: string;
};

export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function listCategories(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  options?: { includeInactive?: boolean },
): Promise<{ data: CategoryRow[] | null; error: ServiceError | null }> {
  let query = supabase
    .from("categories")
    .select("*")
    .eq("household_id", ctx.householdId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    return { data: null, error: err("DB", error.message) };
  }
  return { data: data ?? [], error: null };
}

async function assertUniqueName(
  supabase: AppSupabase,
  householdId: string,
  name: string,
  type: CategoryType,
  excludeId?: string,
): Promise<ServiceError | null> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, type")
    .eq("household_id", householdId)
    .eq("type", type)
    .eq("is_active", true);

  if (error) return err("DB", error.message);

  const needle = normalizeName(name).toLowerCase();
  const clash = (data ?? []).find(
    (row) =>
      row.id !== excludeId &&
      normalizeName(row.name).toLowerCase() === needle,
  );
  if (clash) {
    return err(
      "CONFLICT",
      "Активная категория с таким названием и типом уже есть",
    );
  }
  return null;
}

export async function createCategory(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: CreateCategoryInput,
): Promise<{ data: CategoryRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Наблюдатели не могут создавать категории"),
    };
  }

  const name = normalizeName(input.name);
  const uniqueError = await assertUniqueName(
    supabase,
    ctx.householdId,
    name,
    input.type,
  );
  if (uniqueError) return { data: null, error: uniqueError };

  if (input.parentId) {
    const { data: parent, error: parentError } = await supabase
      .from("categories")
      .select("id, household_id, is_active")
      .eq("id", input.parentId)
      .maybeSingle();
    if (parentError) return { data: null, error: err("DB", parentError.message) };
    if (
      !parent ||
      parent.household_id !== ctx.householdId ||
      !parent.is_active
    ) {
      return { data: null, error: err("VALIDATION", "Родительская категория не найдена") };
    }
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({
      household_id: ctx.householdId,
      name,
      type: input.type,
      color: input.color ?? null,
      icon: input.icon ?? null,
      parent_id: input.parentId ?? null,
      sort_order: input.sortOrder ?? 100,
      is_system: false,
      is_active: true,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Не получилось создать категорию"),
    };
  }
  return { data, error: null };
}

export async function updateCategory(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<{ data: CategoryRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Наблюдатели не могут менять категории"),
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("categories")
    .select("*")
    .eq("id", categoryId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { data: null, error: err("NOT_FOUND", "Категория не найдена") };
  }

  const nextName =
    input.name !== undefined ? normalizeName(input.name) : existing.name;
  const nextType = input.type ?? existing.type;

  if (input.name !== undefined || input.type !== undefined) {
    const uniqueError = await assertUniqueName(
      supabase,
      ctx.householdId,
      nextName,
      nextType,
      categoryId,
    );
    if (uniqueError) return { data: null, error: uniqueError };
  }

  const patch: Database["public"]["Tables"]["categories"]["Update"] = {};
  if (input.name !== undefined) patch.name = nextName;
  if (input.type !== undefined) patch.type = input.type;
  if (input.color !== undefined) patch.color = input.color;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.parentId !== undefined) patch.parent_id = input.parentId;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await supabase
    .from("categories")
    .update(patch)
    .eq("id", categoryId)
    .eq("household_id", ctx.householdId)
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Не получилось обновить категорию"),
    };
  }
  return { data, error: null };
}

/** Hard-delete only when unused; otherwise archive (is_active=false). */
export async function archiveOrDeleteCategory(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  categoryId: string,
): Promise<{ data: { archived: boolean } | null; error: ServiceError | null }> {
  if (!canAdmin(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Удалять категории могут только владелец и админы"),
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { data: null, error: err("NOT_FOUND", "Категория не найдена") };
  }

  const [tx, budgets, recurring] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("household_id", ctx.householdId)
      .eq("category_id", categoryId)
      .is("deleted_at", null),
    supabase
      .from("budgets")
      .select("id", { count: "exact", head: true })
      .eq("household_id", ctx.householdId)
      .eq("category_id", categoryId),
    supabase
      .from("recurring_payments")
      .select("id", { count: "exact", head: true })
      .eq("household_id", ctx.householdId)
      .eq("category_id", categoryId),
  ]);

  const used =
    (tx.count ?? 0) > 0 ||
    (budgets.count ?? 0) > 0 ||
    (recurring.count ?? 0) > 0;

  if (used) {
    const { error } = await supabase
      .from("categories")
      .update({ is_active: false })
      .eq("id", categoryId)
      .eq("household_id", ctx.householdId);
    if (error) return { data: null, error: err("DB", error.message) };
    return { data: { archived: true }, error: null };
  }

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("household_id", ctx.householdId);
  if (error) return { data: null, error: err("DB", error.message) };
  return { data: { archived: false }, error: null };
}
