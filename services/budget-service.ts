import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin, canWrite } from "@/lib/auth/household";
import {
  formatYearMonth,
  monthEndIso,
  monthStartIso,
  parseYearMonth,
} from "@/lib/calculations/budget-month";
import {
  computeBudgetProgress,
  overspentAmount,
  type BudgetProgress,
} from "@/lib/calculations/budget-progress";
import { addMoney, zeroMoney } from "@/lib/calculations/money";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import type {
  CreateBudgetInput,
  UpdateBudgetInput,
} from "@/lib/validations/budget";
import { getHouseholdToday } from "@/services/settings-service";
import type { Database, Money } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB" | "CONFLICT";
  message: string;
};

export type BudgetRow = Database["public"]["Tables"]["budgets"]["Row"];

export type BudgetWithProgress = BudgetRow & {
  categoryName: string | null;
  currency: string;
  spent: Money;
  spentOtherCurrencies: { currency: string; amount: Money }[];
  progress: BudgetProgress;
  overspent: Money;
};

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

function resolveMonth(inputMonth?: string): {
  year: number;
  month: number;
  start: string;
  end: string;
  key: string;
} {
  const { year, month } = parseYearMonth(inputMonth);
  return {
    year,
    month,
    start: monthStartIso(year, month),
    end: monthEndIso(year, month),
    key: formatYearMonth(year, month),
  };
}

/**
 * Sum category expenses for a month in the household base currency.
 * Excludes transfers, income, adjustments, and soft-deleted rows.
 * Non-base-currency expenses are returned separately (FX not implemented).
 */
export type CategorySpend = {
  baseSpent: Money;
  otherCurrencies: { currency: string; amount: Money }[];
};

export async function sumCategoryExpensesForMonth(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  categoryIds: string[],
  year: number,
  month: number,
): Promise<{
  data: Map<string, CategorySpend> | null;
  error: ServiceError | null;
}> {
  const result = new Map<string, CategorySpend>();
  if (categoryIds.length === 0) {
    return { data: result, error: null };
  }

  const start = monthStartIso(year, month);
  const end = monthEndIso(year, month);

  // One paged query for all budgeted categories instead of one per budget.
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("transactions")
      .select("id, category_id, amount, currency")
      .eq("household_id", ctx.householdId)
      .in("category_id", categoryIds)
      .eq("type", "expense")
      .is("deleted_at", null)
      .gte("transaction_date", start)
      .lte("transaction_date", end)
      .order("id", { ascending: true })
      .range(from, to),
  );

  if (error) {
    return { data: null, error: err("DB", error.message) };
  }

  const base = ctx.currency.toUpperCase();
  const baseByCategory = new Map<string, Money>();
  const otherByCategory = new Map<string, Map<string, Money>>();

  for (const row of data ?? []) {
    if (!row.category_id) continue;
    const currency = (row.currency || ctx.currency).toUpperCase();
    if (currency === base) {
      baseByCategory.set(
        row.category_id,
        addMoney(baseByCategory.get(row.category_id) ?? zeroMoney(), row.amount),
      );
    } else {
      const other = otherByCategory.get(row.category_id) ?? new Map();
      other.set(currency, addMoney(other.get(currency) ?? zeroMoney(), row.amount));
      otherByCategory.set(row.category_id, other);
    }
  }

  for (const categoryId of categoryIds) {
    result.set(categoryId, {
      baseSpent: baseByCategory.get(categoryId) ?? zeroMoney(),
      otherCurrencies: [...(otherByCategory.get(categoryId) ?? new Map()).entries()].map(
        ([currency, amount]) => ({ currency, amount }),
      ),
    });
  }

  return { data: result, error: null };
}

export async function listBudgetsForMonth(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  monthKey?: string,
): Promise<{
  data: {
    month: string;
    year: number;
    monthNumber: number;
    currency: string;
    budgets: BudgetWithProgress[];
  } | null;
  error: ServiceError | null;
}> {
  const period = resolveMonth(
    monthKey ?? (await getHouseholdToday(supabase, ctx)).today.slice(0, 7),
  );

  const { data: rows, error } = await supabase
    .from("budgets")
    .select("*")
    .eq("household_id", ctx.householdId)
    .eq("period_type", "monthly")
    .eq("start_date", period.start)
    .eq("is_active", true)
    .not("category_id", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    return { data: null, error: err("DB", error.message) };
  }

  const categoryIds = [
    ...new Set(
      (rows ?? [])
        .map((row) => row.category_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const categoryNameById = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: categories, error: catError } = await supabase
      .from("categories")
      .select("id, name")
      .in("id", categoryIds);
    if (catError) {
      return { data: null, error: err("DB", catError.message) };
    }
    for (const cat of categories ?? []) {
      categoryNameById.set(cat.id, cat.name);
    }
  }

  const spentResult = await sumCategoryExpensesForMonth(
    supabase,
    ctx,
    categoryIds,
    period.year,
    period.month,
  );
  if (spentResult.error || !spentResult.data) {
    return { data: null, error: spentResult.error };
  }
  const spentByCategory = spentResult.data;

  const budgets: BudgetWithProgress[] = [];
  for (const row of rows ?? []) {
    if (!row.category_id) continue;

    const spent = spentByCategory.get(row.category_id) ?? {
      baseSpent: zeroMoney(),
      otherCurrencies: [],
    };
    const progress = computeBudgetProgress(row.amount, spent.baseSpent);

    budgets.push({
      ...row,
      categoryName: categoryNameById.get(row.category_id) ?? null,
      currency: ctx.currency,
      spent: spent.baseSpent,
      spentOtherCurrencies: spent.otherCurrencies,
      progress,
      overspent: overspentAmount(row.amount, spent.baseSpent),
    });
  }

  return {
    data: {
      month: period.key,
      year: period.year,
      monthNumber: period.month,
      currency: ctx.currency,
      budgets,
    },
    error: null,
  };
}

export async function createMonthlyCategoryBudget(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: CreateBudgetInput,
): Promise<{ data: BudgetRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Наблюдатели не могут создавать бюджеты"),
    };
  }

  const period = resolveMonth(input.month);

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id, name, type, household_id, is_system, is_active")
    .eq("id", input.categoryId)
    .maybeSingle();

  if (categoryError) {
    return { data: null, error: err("DB", categoryError.message) };
  }
  if (
    !category ||
    !category.is_active ||
    (category.household_id !== null &&
      category.household_id !== ctx.householdId)
  ) {
    return { data: null, error: err("VALIDATION", "Категория не найдена") };
  }
  if (category.type !== "expense" && category.type !== "both") {
    return {
      data: null,
      error: err("VALIDATION", "Бюджет можно задать только для категорий расходов"),
    };
  }

  const { data: existing } = await supabase
    .from("budgets")
    .select("id")
    .eq("household_id", ctx.householdId)
    .eq("category_id", input.categoryId)
    .eq("period_type", "monthly")
    .eq("start_date", period.start)
    .eq("is_active", true)
    .maybeSingle();

  if (existing) {
    return {
      data: null,
      error: err(
        "CONFLICT",
        "На этот месяц у категории уже есть бюджет",
      ),
    };
  }

  const name =
    input.name?.trim() ||
    `${category.name} · ${period.key}`;

  const { data, error } = await supabase
    .from("budgets")
    .insert({
      household_id: ctx.householdId,
      name,
      period_type: "monthly",
      start_date: period.start,
      end_date: period.end,
      amount: input.amount,
      category_id: input.categoryId,
      account_id: null,
      member_id: null,
      is_active: true,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (
      error?.code === "23505" ||
      (error?.message ?? "").includes("budgets_household_category_month")
    ) {
      return {
        data: null,
        error: err(
          "CONFLICT",
          "На этот месяц у категории уже есть бюджет",
        ),
      };
    }
    return {
      data: null,
      error: err("DB", error?.message ?? "Не получилось создать бюджет"),
    };
  }

  return { data, error: null };
}

export async function updateBudget(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  budgetId: string,
  input: UpdateBudgetInput,
): Promise<{ data: BudgetRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Наблюдатели не могут менять бюджеты"),
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("budgets")
    .select("*")
    .eq("id", budgetId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { data: null, error: err("NOT_FOUND", "Бюджет не найден") };
  }

  if (input.categoryId) {
    const { data: category, error: categoryError } = await supabase
      .from("categories")
      .select("id, type, household_id, is_active")
      .eq("id", input.categoryId)
      .maybeSingle();

    if (categoryError) {
      return { data: null, error: err("DB", categoryError.message) };
    }
    if (
      !category ||
      !category.is_active ||
      (category.household_id !== null &&
        category.household_id !== ctx.householdId)
    ) {
      return { data: null, error: err("VALIDATION", "Категория не найдена") };
    }
    if (category.type !== "expense" && category.type !== "both") {
      return {
        data: null,
        error: err(
          "VALIDATION",
          "Бюджет можно задать только для категорий расходов",
        ),
      };
    }
  }

  const patch: Database["public"]["Tables"]["budgets"]["Update"] = {};
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.name !== undefined) patch.name = input.name;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await supabase
    .from("budgets")
    .update(patch)
    .eq("id", budgetId)
    .eq("household_id", ctx.householdId)
    .select("*")
    .single();

  if (error || !data) {
    if (
      error?.code === "23505" ||
      (error?.message ?? "").includes("budgets_household_category_month")
    ) {
      return {
        data: null,
        error: err(
          "CONFLICT",
          "На этот месяц у категории уже есть бюджет",
        ),
      };
    }
    return {
      data: null,
      error: err("DB", error?.message ?? "Не получилось обновить бюджет"),
    };
  }

  return { data, error: null };
}

/**
 * Soft-delete (deactivate) for members; hard-delete for owners/admins.
 */
export async function deleteBudget(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  budgetId: string,
): Promise<{ error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { error: err("FORBIDDEN", "Наблюдатели не могут удалять бюджеты") };
  }

  const { data: existing, error: existingError } = await supabase
    .from("budgets")
    .select("id")
    .eq("id", budgetId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (existingError) {
    return { error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { error: err("NOT_FOUND", "Бюджет не найден") };
  }

  if (canAdmin(ctx.role)) {
    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("id", budgetId)
      .eq("household_id", ctx.householdId);
    if (error) {
      return { error: err("DB", error.message) };
    }
    return { error: null };
  }

  const { error } = await supabase
    .from("budgets")
    .update({ is_active: false })
    .eq("id", budgetId)
    .eq("household_id", ctx.householdId);

  if (error) {
    return { error: err("DB", error.message) };
  }
  return { error: null };
}
