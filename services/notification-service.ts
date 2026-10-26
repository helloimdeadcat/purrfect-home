import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB";
  message: string;
};

export type NotificationRow =
  Database["public"]["Tables"]["notifications"]["Row"];

/**
 * In-app notifications. Rows are created only by database triggers
 * (recurring confirm/skip, member joined, role changed); users read their
 * own and can mark them read.
 */

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

export const NOTIFICATION_PAGE_SIZE = 50;

export async function listNotifications(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  options?: { limit?: number },
): Promise<{ data: NotificationRow[] | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", ctx.user.id)
    .eq("household_id", ctx.householdId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? NOTIFICATION_PAGE_SIZE);

  if (error) return { data: null, error: err("DB", error.message) };
  return { data: data ?? [], error: null };
}

export async function countUnreadNotifications(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{ data: number | null; error: ServiceError | null }> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user.id)
    .eq("household_id", ctx.householdId)
    .eq("is_read", false);

  if (error) return { data: null, error: err("DB", error.message) };
  return { data: count ?? 0, error: null };
}

/** Mark the given notifications read, or all unread ones when `ids` is omitted. */
export async function markNotificationsRead(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  ids?: string[],
): Promise<{ error: ServiceError | null }> {
  if (ids && ids.length === 0) return { error: null };

  let query = supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", ctx.user.id)
    .eq("household_id", ctx.householdId)
    .eq("is_read", false);
  if (ids) query = query.in("id", ids);

  const { error } = await query;
  if (error) return { error: err("DB", error.message) };
  return { error: null };
}
