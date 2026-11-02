import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin, canWrite } from "@/lib/auth/household";
import type {
  CreateIncomeSourceInput,
  UpdateIncomeSourceInput,
} from "@/lib/validations/settings";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB" | "CONFLICT";
  message: string;
};

export type IncomeSourceRow =
  Database["public"]["Tables"]["income_sources"]["Row"];

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

async function assertAccount(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  accountId: string,
  currency?: string,
): Promise<{ currency: string } | { error: ServiceError }> {
  const { data: account, error } = await supabase
    .from("accounts")
    .select("id, currency, is_active, household_id")
    .eq("id", accountId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (error) return { error: err("DB", error.message) };
  if (!account || !account.is_active) {
    return { error: err("VALIDATION", "Счёт не найден или в архиве") };
  }
  const resolved = (currency ?? account.currency).toUpperCase();
  if (resolved !== account.currency.toUpperCase()) {
    return {
      error: err(
        "VALIDATION",
        "Валюта должна совпадать с валютой счёта (пересчёт курсов пока не поддерживается)",
      ),
    };
  }
  return { currency: resolved };
}

async function assertMember(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  memberId: string,
): Promise<ServiceError | null> {
  const { data, error } = await supabase
    .from("household_members")
    .select("id")
    .eq("id", memberId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();
  if (error) return err("DB", error.message);
  if (!data) return err("VALIDATION", "Такого участника в семье нет");
  return null;
}

export async function listIncomeSources(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  options?: { includeInactive?: boolean },
): Promise<{ data: IncomeSourceRow[] | null; error: ServiceError | null }> {
  let query = supabase
    .from("income_sources")
    .select("*")
    .eq("household_id", ctx.householdId)
    .order("name", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: err("DB", error.message) };
  return { data: data ?? [], error: null };
}

export async function createIncomeSource(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: CreateIncomeSourceInput,
): Promise<{ data: IncomeSourceRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Наблюдатели не могут создавать источники дохода"),
    };
  }

  const memberId = input.memberId ?? ctx.membershipId;
  const memberError = await assertMember(supabase, ctx, memberId);
  if (memberError) return { data: null, error: memberError };

  const accountCheck = await assertAccount(
    supabase,
    ctx,
    input.accountId,
    input.currency,
  );
  if ("error" in accountCheck) return { data: null, error: accountCheck.error };

  const { data, error } = await supabase
    .from("income_sources")
    .insert({
      household_id: ctx.householdId,
      member_id: memberId,
      name: input.name.trim(),
      amount: input.amount,
      currency: accountCheck.currency,
      frequency: input.frequency,
      next_date: input.nextDate,
      account_id: input.accountId,
      is_active: true,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Не получилось создать источник дохода"),
    };
  }
  return { data, error: null };
}

export async function updateIncomeSource(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  sourceId: string,
  input: UpdateIncomeSourceInput,
): Promise<{ data: IncomeSourceRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Наблюдатели не могут менять источники дохода"),
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("income_sources")
    .select("*")
    .eq("id", sourceId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { data: null, error: err("NOT_FOUND", "Источник дохода не найден") };
  }

  if (input.memberId) {
    const memberError = await assertMember(supabase, ctx, input.memberId);
    if (memberError) return { data: null, error: memberError };
  }

  const nextAccountId = input.accountId ?? existing.account_id;
  if (input.accountId || input.currency) {
    const accountCheck = await assertAccount(
      supabase,
      ctx,
      nextAccountId,
      input.currency ?? existing.currency,
    );
    if ("error" in accountCheck) {
      return { data: null, error: accountCheck.error };
    }
  }

  const patch: Database["public"]["Tables"]["income_sources"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.frequency !== undefined) patch.frequency = input.frequency;
  if (input.nextDate !== undefined) patch.next_date = input.nextDate;
  if (input.accountId !== undefined) patch.account_id = input.accountId;
  if (input.memberId !== undefined) patch.member_id = input.memberId;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await supabase
    .from("income_sources")
    .update(patch)
    .eq("id", sourceId)
    .eq("household_id", ctx.householdId)
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Не получилось обновить источник дохода"),
    };
  }
  return { data, error: null };
}

export async function archiveIncomeSource(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  sourceId: string,
): Promise<{ error: ServiceError | null }> {
  if (!canAdmin(ctx.role)) {
    return {
      error: err(
        "FORBIDDEN",
        "Архивировать источники дохода могут только владелец и админы",
      ),
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("income_sources")
    .select("id")
    .eq("id", sourceId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (existingError) return { error: err("DB", existingError.message) };
  if (!existing) return { error: err("NOT_FOUND", "Источник дохода не найден") };

  const { error } = await supabase
    .from("income_sources")
    .update({ is_active: false })
    .eq("id", sourceId)
    .eq("household_id", ctx.householdId);

  if (error) return { error: err("DB", error.message) };
  return { error: null };
}
