import type { SupabaseClient } from "@supabase/supabase-js";

import {
  calculateAccountBalance,
  summarizeBalancesByCurrency,
  type CurrencyBalanceSummary,
} from "@/lib/calculations/account-balance";
import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin, canWrite } from "@/lib/auth/household";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import type { CreateAccountInput, UpdateAccountInput } from "@/lib/validations/account";
import type { Database, Money } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB";
  message: string;
};

export type AccountWithBalance = Database["public"]["Tables"]["accounts"]["Row"] & {
  balance: Money;
};

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

/**
 * Accounts without balances — for pickers and labels. Much cheaper than
 * listAccountsWithBalances, which pages through every transaction/transfer.
 */
export async function listAccounts(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{
  data: Database["public"]["Tables"]["accounts"]["Row"][] | null;
  error: ServiceError | null;
}> {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("household_id", ctx.householdId)
    .order("name", { ascending: true });
  if (error) return { data: null, error: err("DB", error.message) };
  return { data: data ?? [], error: null };
}

export async function listAccountsWithBalances(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{ data: AccountWithBalance[] | null; error: ServiceError | null }> {
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("household_id", ctx.householdId)
    .order("name", { ascending: true });

  if (error) {
    return { data: null, error: err("DB", error.message) };
  }

  const accountIds = (accounts ?? []).map((account) => account.id);
  if (accountIds.length === 0) {
    return { data: [], error: null };
  }

  const [txResult, transferResult] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("transactions")
        .select("id, account_id, type, amount, deleted_at, adjustment_direction")
        .eq("household_id", ctx.householdId)
        .in("account_id", accountIds)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("transfers")
        .select("id, from_account_id, to_account_id, amount")
        .eq("household_id", ctx.householdId)
        .or(
          `from_account_id.in.(${accountIds.join(",")}),to_account_id.in.(${accountIds.join(",")})`,
        )
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  // A partial read would produce a plausible but wrong balance — fail instead.
  if (txResult.error) {
    return { data: null, error: err("DB", txResult.error.message) };
  }
  if (transferResult.error) {
    return { data: null, error: err("DB", transferResult.error.message) };
  }
  const transactions = txResult.data;
  const transfers = transferResult.data;

  const withBalances = (accounts ?? []).map((account) => {
    const accountTx = (transactions ?? []).filter(
      (tx) => tx.account_id === account.id,
    );
    const accountTransfers = (transfers ?? []).filter(
      (transfer) =>
        transfer.from_account_id === account.id ||
        transfer.to_account_id === account.id,
    );

    return {
      ...account,
      balance: calculateAccountBalance({
        accountId: account.id,
        initialBalance: account.initial_balance,
        transactions: accountTx,
        transfers: accountTransfers,
      }),
    };
  });

  return { data: withBalances, error: null };
}

export async function createAccount(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: CreateAccountInput,
): Promise<{ data: AccountWithBalance | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { data: null, error: err("FORBIDDEN", "Наблюдатели не могут создавать счета") };
  }

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      household_id: ctx.householdId,
      owner_member_id: ctx.membershipId,
      name: input.name,
      type: input.type,
      currency: input.currency ?? ctx.currency,
      initial_balance: input.initialBalance,
      is_shared: input.isShared,
      is_active: true,
      color: input.color ?? null,
      icon: input.icon ?? null,
      note: input.note ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Не получилось создать счёт"),
    };
  }

  return {
    data: { ...data, balance: data.initial_balance as Money },
    error: null,
  };
}

export async function updateAccount(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  accountId: string,
  input: UpdateAccountInput,
): Promise<{ data: AccountWithBalance | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { data: null, error: err("FORBIDDEN", "Наблюдатели не могут менять счета") };
  }

  const { data: existing, error: existingError } = await supabase
    .from("accounts")
    .select("id, currency")
    .eq("id", accountId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { data: null, error: err("NOT_FOUND", "Счёт не найден") };
  }

  // Without FX, re-labelling the currency would silently reinterpret every
  // historical amount on this account.
  if (
    input.currency !== undefined &&
    input.currency.toUpperCase() !== existing.currency.toUpperCase()
  ) {
    const [txCount, transferCount] = await Promise.all([
      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("household_id", ctx.householdId)
        .eq("account_id", accountId),
      supabase
        .from("transfers")
        .select("id", { count: "exact", head: true })
        .eq("household_id", ctx.householdId)
        .or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`),
    ]);
    if (txCount.error || transferCount.error) {
      return {
        data: null,
        error: err("DB", (txCount.error ?? transferCount.error)!.message),
      };
    }
    if ((txCount.count ?? 0) > 0 || (transferCount.count ?? 0) > 0) {
      return {
        data: null,
        error: err(
          "VALIDATION",
          "Валюту нельзя поменять: на счёте уже есть операции или переводы",
        ),
      };
    }
  }

  const patch: Database["public"]["Tables"]["accounts"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.type !== undefined) patch.type = input.type;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.initialBalance !== undefined) {
    patch.initial_balance = input.initialBalance;
  }
  if (input.isShared !== undefined) patch.is_shared = input.isShared;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.color !== undefined) patch.color = input.color;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.note !== undefined) patch.note = input.note;

  const { data, error } = await supabase
    .from("accounts")
    .update(patch)
    .eq("id", accountId)
    .eq("household_id", ctx.householdId)
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Не получилось обновить счёт"),
    };
  }

  const listed = await listAccountsWithBalances(supabase, ctx);
  const updated = listed.data?.find((account) => account.id === accountId) ?? {
    ...data,
    balance: data.initial_balance as Money,
  };

  return { data: updated, error: null };
}

export async function deactivateAccount(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  accountId: string,
): Promise<{ error: ServiceError | null }> {
  if (!canAdmin(ctx.role)) {
    return { error: err("FORBIDDEN", "Отключать счета могут только владельцы и админы") };
  }

  const { error } = await supabase
    .from("accounts")
    .update({ is_active: false })
    .eq("id", accountId)
    .eq("household_id", ctx.householdId);

  if (error) {
    return { error: err("DB", error.message) };
  }

  return { error: null };
}

/**
 * Household wealth summary. Never mixes currencies into one number.
 * FX conversion is not available.
 */
export function summarizeHouseholdWealth(
  accounts: AccountWithBalance[],
  baseCurrency: string,
): CurrencyBalanceSummary {
  return summarizeBalancesByCurrency(accounts, baseCurrency);
}

/** @deprecated Use summarizeHouseholdWealth — kept name would mix currencies. */
export function totalNetWorth(
  accounts: AccountWithBalance[],
  baseCurrency: string,
): Money {
  return summarizeHouseholdWealth(accounts, baseCurrency).baseTotal;
}
