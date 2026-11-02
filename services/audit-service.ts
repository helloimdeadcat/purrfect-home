import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin } from "@/lib/auth/household";
import { listFamilyMembers } from "@/services/family-service";
import type { Database, Json } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB";
  message: string;
};

export type AuditEntry = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  actor: string;
  oldData: Json | null;
  newData: Json | null;
};

export const AUDIT_PAGE_SIZE = 100;

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

/**
 * Household activity log (owners/admins only — RLS enforces the same).
 * Entries are written by database triggers and are read-only here.
 */
export async function listAuditLog(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  options?: { before?: string; limit?: number },
): Promise<{ data: AuditEntry[] | null; error: ServiceError | null }> {
  if (!canAdmin(ctx.role)) {
    return { data: null, error: err("FORBIDDEN", "Историю могут смотреть только владелец и админы") };
  }

  let query = supabase
    .from("audit_logs")
    .select("id, created_at, action, entity_type, user_id, old_data, new_data")
    .eq("household_id", ctx.householdId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? AUDIT_PAGE_SIZE);
  if (options?.before) query = query.lt("created_at", options.before);

  const [{ data, error }, members] = await Promise.all([
    query,
    listFamilyMembers(supabase, ctx),
  ]);
  if (error) return { data: null, error: err("DB", error.message) };

  const nameByUser = new Map(
    (members.data ?? []).map((m) => [
      m.user_id,
      m.display_name || m.email?.split("@")[0] || "Участник",
    ]),
  );

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      action: row.action,
      entityType: row.entity_type,
      actor: row.user_id ? (nameByUser.get(row.user_id) ?? "Бывший участник") : "Система",
      oldData: row.old_data,
      newData: row.new_data,
    })),
    error: null,
  };
}
