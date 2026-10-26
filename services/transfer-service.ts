import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canWrite } from "@/lib/auth/household";
import type { CreateTransferInput } from "@/lib/validations/transfer";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB";
  message: string;
};

export type TransferRow = Database["public"]["Tables"]["transfers"]["Row"];

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

export async function listTransfers(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  options?: { limit?: number },
): Promise<{ data: TransferRow[] | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from("transfers")
    .select("*")
    .eq("household_id", ctx.householdId)
    .order("transfer_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 50);

  if (error) {
    return { data: null, error: err("DB", error.message) };
  }

  return { data: data ?? [], error: null };
}

export async function createTransfer(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: CreateTransferInput,
): Promise<{ data: TransferRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { data: null, error: err("FORBIDDEN", "Viewers cannot create transfers") };
  }

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, currency, is_active")
    .eq("household_id", ctx.householdId)
    .in("id", [input.fromAccountId, input.toAccountId]);

  if (accountsError) {
    return { data: null, error: err("DB", accountsError.message) };
  }

  const from = accounts?.find((account) => account.id === input.fromAccountId);
  const to = accounts?.find((account) => account.id === input.toAccountId);

  if (!from || !to || !from.is_active || !to.is_active) {
    return {
      data: null,
      error: err("VALIDATION", "Both accounts must exist and be active"),
    };
  }

  if (from.currency !== to.currency) {
    return {
      data: null,
      error: err(
        "VALIDATION",
        `Currency conversion is not implemented. Cannot transfer between ${from.currency} and ${to.currency}.`,
      ),
    };
  }

  if (input.currency && input.currency !== from.currency) {
    return {
      data: null,
      error: err(
        "VALIDATION",
        `Transfer currency must match account currency (${from.currency}).`,
      ),
    };
  }

  const currency = from.currency;

  const { data, error } = await supabase
    .from("transfers")
    .insert({
      household_id: ctx.householdId,
      from_account_id: input.fromAccountId,
      to_account_id: input.toAccountId,
      amount: input.amount,
      currency,
      transfer_date: input.transferDate,
      description: input.description ?? null,
      created_by: ctx.user.id,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Failed to create transfer"),
    };
  }

  return { data, error: null };
}
