import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin, canWrite } from "@/lib/auth/household";
import { addMoney, zeroMoney } from "@/lib/calculations/money";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
} from "@/lib/validations/transaction";
import { setTransactionTags } from "@/services/tag-service";
import type { Database, Money } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB" | "CONFLICT";
  message: string;
};

export type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

export async function listTransactions(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  options?: { limit?: number; includeDeleted?: boolean },
): Promise<{ data: TransactionRow[] | null; error: ServiceError | null }> {
  let query = supabase
    .from("transactions")
    .select("*")
    .eq("household_id", ctx.householdId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 100);

  if (!options?.includeDeleted) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query;
  if (error) {
    return { data: null, error: err("DB", error.message) };
  }

  return { data: data ?? [], error: null };
}

export async function createTransaction(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: CreateTransactionInput,
): Promise<{ data: TransactionRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Viewers cannot create transactions"),
    };
  }

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, currency, is_active")
    .eq("id", input.accountId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (accountError) {
    return { data: null, error: err("DB", accountError.message) };
  }
  if (!account || !account.is_active) {
    return { data: null, error: err("VALIDATION", "Account not found or inactive") };
  }
  if (
    input.currency &&
    input.currency.toUpperCase() !== account.currency.toUpperCase()
  ) {
    return {
      data: null,
      error: err("VALIDATION", "Transaction currency must match the account currency"),
    };
  }

  if (input.type === "adjustment" && !input.adjustmentDirection) {
    return {
      data: null,
      error: err("VALIDATION", "adjustmentDirection is required for adjustments"),
    };
  }

  if (input.categoryId) {
    const { data: category, error: categoryError } = await supabase
      .from("categories")
      .select("id, type, household_id, is_system, is_active")
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
      return { data: null, error: err("VALIDATION", "Category not found") };
    }
    if (
      category.type !== "both" &&
      category.type !== input.type &&
      input.type !== "adjustment"
    ) {
      return {
        data: null,
        error: err("VALIDATION", "Category type does not match transaction type"),
      };
    }
  }

  let incomeSourceId: string | null = null;
  if (input.incomeSourceId) {
    if (input.type !== "income") {
      return {
        data: null,
        error: err("VALIDATION", "Income source is only allowed for income"),
      };
    }
    const { data: source, error: sourceError } = await supabase
      .from("income_sources")
      .select("id, is_active")
      .eq("id", input.incomeSourceId)
      .eq("household_id", ctx.householdId)
      .maybeSingle();
    if (sourceError) {
      return { data: null, error: err("DB", sourceError.message) };
    }
    if (!source || !source.is_active) {
      return { data: null, error: err("VALIDATION", "Income source not found") };
    }
    incomeSourceId = source.id;
  }

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      household_id: ctx.householdId,
      account_id: input.accountId,
      category_id: input.categoryId ?? null,
      created_by: ctx.user.id,
      owner_member_id: input.ownerMemberId ?? ctx.membershipId,
      type: input.type,
      amount: input.amount,
      currency: input.currency ?? account.currency,
      transaction_date: input.transactionDate,
      description: input.description ?? null,
      merchant: input.merchant ?? null,
      is_recurring: false,
      is_necessary: input.isNecessary,
      is_confirmed: true,
      notes: input.notes ?? null,
      adjustment_direction:
        input.type === "adjustment" ? (input.adjustmentDirection ?? null) : null,
      income_source_id: incomeSourceId,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Failed to create transaction"),
    };
  }

  if (input.tagIds && input.tagIds.length > 0) {
    const tagResult = await setTransactionTags(
      supabase,
      ctx,
      data.id,
      input.tagIds,
    );
    if (tagResult.error) {
      return { data: null, error: tagResult.error };
    }
  }

  return { data, error: null };
}

export async function updateTransaction(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  transactionId: string,
  input: UpdateTransactionInput,
): Promise<{ data: TransactionRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Viewers cannot update transactions"),
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("household_id", ctx.householdId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { data: null, error: err("NOT_FOUND", "Transaction not found") };
  }

  if (
    ctx.role === "member" &&
    existing.created_by !== ctx.user.id &&
    !canAdmin(ctx.role)
  ) {
    return {
      data: null,
      error: err("FORBIDDEN", "Members can only edit their own transactions"),
    };
  }

  let targetAccountCurrency: string | null = null;
  if (input.accountId !== undefined) {
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id, is_active, currency")
      .eq("id", input.accountId)
      .eq("household_id", ctx.householdId)
      .maybeSingle();

    if (accountError) {
      return { data: null, error: err("DB", accountError.message) };
    }
    if (!account || !account.is_active) {
      return {
        data: null,
        error: err("VALIDATION", "Account not found or inactive in this household"),
      };
    }
    targetAccountCurrency = account.currency.toUpperCase();
  }

  // Amounts are never converted: the transaction must stay in its account's
  // currency, both when moving it to another account and when relabelling it.
  const nextCurrency = (input.currency ?? existing.currency).toUpperCase();
  if (targetAccountCurrency !== null && targetAccountCurrency !== nextCurrency) {
    return {
      data: null,
      error: err("VALIDATION", "Transaction currency must match the account currency"),
    };
  }
  if (
    targetAccountCurrency === null &&
    input.currency !== undefined &&
    nextCurrency !== existing.currency.toUpperCase()
  ) {
    return {
      data: null,
      error: err("VALIDATION", "Transaction currency must match the account currency"),
    };
  }

  const nextType = input.type ?? existing.type;
  const nextDirection =
    input.adjustmentDirection !== undefined
      ? input.adjustmentDirection
      : existing.adjustment_direction;

  if (nextType === "adjustment" && !nextDirection) {
    return {
      data: null,
      error: err("VALIDATION", "adjustmentDirection is required for adjustments"),
    };
  }

  const patch: Database["public"]["Tables"]["transactions"]["Update"] = {};
  if (input.accountId !== undefined) patch.account_id = input.accountId;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.ownerMemberId !== undefined) {
    patch.owner_member_id = input.ownerMemberId;
  }
  if (input.type !== undefined) patch.type = input.type;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.transactionDate !== undefined) {
    patch.transaction_date = input.transactionDate;
  }
  if (input.description !== undefined) patch.description = input.description;
  if (input.merchant !== undefined) patch.merchant = input.merchant;
  if (input.isNecessary !== undefined) patch.is_necessary = input.isNecessary;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (
    input.type !== undefined ||
    input.adjustmentDirection !== undefined ||
    existing.type === "adjustment"
  ) {
    patch.adjustment_direction =
      nextType === "adjustment" ? nextDirection : null;
  }

  if (input.incomeSourceId !== undefined) {
    if (input.incomeSourceId === null) {
      patch.income_source_id = null;
    } else {
      if (nextType !== "income") {
        return {
          data: null,
          error: err("VALIDATION", "Income source is only allowed for income"),
        };
      }
      const { data: source, error: sourceError } = await supabase
        .from("income_sources")
        .select("id, is_active")
        .eq("id", input.incomeSourceId)
        .eq("household_id", ctx.householdId)
        .maybeSingle();
      if (sourceError) {
        return { data: null, error: err("DB", sourceError.message) };
      }
      if (!source) {
        return {
          data: null,
          error: err("VALIDATION", "Income source not found"),
        };
      }
      // Allow assigning archived sources only when already linked historically;
      // new assignment requires active source.
      if (!source.is_active && existing.income_source_id !== source.id) {
        return {
          data: null,
          error: err("VALIDATION", "Income source is archived"),
        };
      }
      patch.income_source_id = source.id;
    }
  }

  if (nextType !== "income" && existing.income_source_id) {
    patch.income_source_id = null;
  }

  const { data, error } = await supabase
    .from("transactions")
    .update(patch)
    .eq("id", transactionId)
    .eq("household_id", ctx.householdId)
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Failed to update transaction"),
    };
  }

  if (input.tagIds !== undefined) {
    const tagResult = await setTransactionTags(
      supabase,
      ctx,
      data.id,
      input.tagIds,
    );
    if (tagResult.error) {
      return { data: null, error: tagResult.error };
    }
  }

  return { data, error: null };
}

export async function softDeleteTransaction(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  transactionId: string,
): Promise<{ error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { error: err("FORBIDDEN", "Viewers cannot delete transactions") };
  }

  const { data: existing, error: existingError } = await supabase
    .from("transactions")
    .select("id, created_by")
    .eq("id", transactionId)
    .eq("household_id", ctx.householdId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError) {
    return { error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { error: err("NOT_FOUND", "Transaction not found") };
  }

  if (ctx.role === "member" && existing.created_by !== ctx.user.id) {
    return {
      error: err("FORBIDDEN", "Members can only delete their own transactions"),
    };
  }

  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", transactionId)
    .eq("household_id", ctx.householdId);

  if (error) {
    return { error: err("DB", error.message) };
  }

  // A recurring occurrence confirmed by this transaction would otherwise stay
  // "paid" while its money vanished from the balance — the obligation would
  // be counted nowhere and Safe-to-Spend would be too high. Reopen it.
  const { error: reopenError } = await supabase
    .from("recurring_payment_occurrences")
    .update({
      status: "pending",
      transaction_id: null,
      processed_at: null,
      processed_by: null,
    })
    .eq("household_id", ctx.householdId)
    .eq("transaction_id", transactionId);

  if (reopenError) {
    return { error: err("DB", reopenError.message) };
  }

  return { error: null };
}

export type CurrencyIncomeExpense = {
  currency: string;
  income: Money;
  expense: Money;
};

/**
 * Month income/expense, split per currency (no FX). `income` / `expense`
 * are the household base-currency figures; other currencies are reported
 * separately in `otherCurrencies` and are never added to them.
 */
export async function monthlyIncomeExpense(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  year: number,
  month: number,
): Promise<{
  data:
    | {
        currency: string;
        income: Money;
        expense: Money;
        otherCurrencies: CurrencyIncomeExpense[];
      }
    | null;
  error: ServiceError | null;
}> {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = endDate.toISOString().slice(0, 10);

  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("transactions")
      .select("id, type, amount, currency")
      .eq("household_id", ctx.householdId)
      .is("deleted_at", null)
      .gte("transaction_date", start)
      .lte("transaction_date", end)
      .in("type", ["income", "expense"])
      .order("id", { ascending: true })
      .range(from, to),
  );

  if (error) {
    return { data: null, error: err("DB", error.message) };
  }

  const baseCurrency = ctx.currency.toUpperCase();
  const totals = new Map<string, CurrencyIncomeExpense>();
  totals.set(baseCurrency, {
    currency: baseCurrency,
    income: zeroMoney(),
    expense: zeroMoney(),
  });

  for (const row of data ?? []) {
    const currency = row.currency.toUpperCase();
    const entry = totals.get(currency) ?? {
      currency,
      income: zeroMoney(),
      expense: zeroMoney(),
    };
    if (row.type === "income") {
      entry.income = addMoney(entry.income, row.amount);
    } else if (row.type === "expense") {
      entry.expense = addMoney(entry.expense, row.amount);
    }
    totals.set(currency, entry);
  }

  const base = totals.get(baseCurrency)!;
  const otherCurrencies = [...totals.values()]
    .filter((entry) => entry.currency !== baseCurrency)
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    data: {
      currency: baseCurrency,
      income: base.income,
      expense: base.expense,
      otherCurrencies,
    },
    error: null,
  };
}
