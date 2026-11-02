import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin } from "@/lib/auth/household";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB";
  message: string;
};

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

/** Tables keyed by household_id (or households.id). */
const HOUSEHOLD_TABLES = [
  "households",
  "household_settings",
  "household_members",
  "household_invitations",
  "accounts",
  "categories",
  "tags",
  "income_sources",
  "transactions",
  "transfers",
  "transaction_tags",
  "budgets",
  "goals",
  "goal_operations",
  "recurring_payments",
  "recurring_payment_occurrences",
  "receipts",
  "tasks",
  "task_completions",
  "habits",
  "habit_checkins",
  "foods",
  "meal_plans",
  "meal_plan_meals",
  "meal_plan_portions",
  "nutrition_targets",
  "notifications",
  "audit_logs",
] as const;

type HouseholdTable = (typeof HOUSEHOLD_TABLES)[number];

export type HouseholdBackup = {
  version: 1;
  exportedAt: string;
  householdId: string;
  householdName: string;
  note: string;
  tables: Partial<Record<HouseholdTable, unknown[]>>;
};

async function loadTable(
  supabase: AppSupabase,
  table: HouseholdTable,
  householdId: string,
): Promise<{ data: unknown[] | null; error: ServiceError | null }> {
  if (table === "households") {
    const { data, error } = await supabase
      .from("households")
      .select("*")
      .eq("id", householdId);
    if (error) return { data: null, error: err("DB", error.message) };
    return { data: data ?? [], error: null };
  }

  if (table === "household_settings") {
    const { data, error } = await supabase
      .from("household_settings")
      .select("*")
      .eq("household_id", householdId);
    if (error) return { data: null, error: err("DB", error.message) };
    return { data: data ?? [], error: null };
  }

  if (table === "transaction_tags") {
    const { data: txns, error: txError } = await fetchAllPages((from, to) =>
      supabase
        .from("transactions")
        .select("id")
        .eq("household_id", householdId)
        .order("id")
        .range(from, to),
    );
    if (txError) return { data: null, error: err("DB", txError.message) };
    const txIds = (txns ?? []).map((t) => t.id);
    if (txIds.length === 0) return { data: [], error: null };

    const rows: unknown[] = [];
    for (let i = 0; i < txIds.length; i += 100) {
      const chunk = txIds.slice(i, i + 100);
      const { data, error } = await fetchAllPages((from, to) =>
        supabase
          .from("transaction_tags")
          .select("*")
          .in("transaction_id", chunk)
          .order("transaction_id")
          .order("tag_id")
          .range(from, to),
      );
      if (error) return { data: null, error: err("DB", error.message) };
      rows.push(...(data ?? []));
    }
    return { data: rows, error: null };
  }

  if (table === "habit_checkins") {
    // habit_checkins has no household_id — go via habits.
    const { data: habits, error: habitsError } = await fetchAllPages((from, to) =>
      supabase
        .from("habits")
        .select("id")
        .eq("household_id", householdId)
        .order("id")
        .range(from, to),
    );
    if (habitsError) {
      return { data: null, error: err("DB", habitsError.message) };
    }
    const habitIds = (habits ?? []).map((h) => h.id);
    if (habitIds.length === 0) return { data: [], error: null };

    const rows: unknown[] = [];
    for (let i = 0; i < habitIds.length; i += 100) {
      const chunk = habitIds.slice(i, i + 100);
      const { data, error } = await fetchAllPages((from, to) =>
        supabase
          .from("habit_checkins")
          .select("*")
          .in("habit_id", chunk)
          .order("id")
          .range(from, to),
      );
      if (error) return { data: null, error: err("DB", error.message) };
      rows.push(...(data ?? []));
    }
    return { data: rows, error: null };
  }

  if (table === "nutrition_targets") {
    const { data, error } = await fetchAllPages((from, to) =>
      supabase
        .from("nutrition_targets")
        .select("*")
        .eq("household_id", householdId)
        .order("member_id")
        .range(from, to),
    );
    if (error) return { data: null, error: err("DB", error.message) };
    return { data: data ?? [], error: null };
  }

  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from(table)
      .select("*")
      .eq("household_id", householdId)
      .order("id")
      .range(from, to),
  );
  if (error) return { data: null, error: err("DB", error.message) };
  return { data: data ?? [], error: null };
}

/**
 * Full JSON snapshot of one household for offline backup.
 * Owners/admins only. Receipt binary files in Storage are listed by path
 * only — re-download them separately if needed.
 */
export async function exportHouseholdBackup(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{ data: HouseholdBackup | null; error: ServiceError | null }> {
  if (!canAdmin(ctx.role)) {
    return {
      data: null,
      error: err(
        "FORBIDDEN",
        "Резервную копию могут скачать только владелец и админ",
      ),
    };
  }

  const tables: HouseholdBackup["tables"] = {};
  for (const table of HOUSEHOLD_TABLES) {
    const { data, error } = await loadTable(supabase, table, ctx.householdId);
    if (error) return { data: null, error };
    tables[table] = data ?? [];
  }

  return {
    data: {
      version: 1,
      exportedAt: new Date().toISOString(),
      householdId: ctx.householdId,
      householdName: ctx.householdName,
      note:
        "Purrfect Home household backup. Receipt image bytes live in Supabase Storage (paths in receipts.storage_path). Not a full DB dump.",
      tables,
    },
    error: null,
  };
}
