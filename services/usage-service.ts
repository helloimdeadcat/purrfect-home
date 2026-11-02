import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

/**
 * Per-household receipts budget. Supabase Free has 1 GB of Storage for the
 * whole project; 800 MB leaves headroom for avatars/other buckets.
 */
export const RECEIPTS_BUDGET_BYTES = 800 * 1024 * 1024;

export type ReceiptUsage = { files: number; bytes: number };

/** Sum of receipt sizes via household_receipt_usage() (RLS applies). */
export async function getReceiptUsage(
  supabase: AppSupabase,
  householdId: string,
): Promise<{ data: ReceiptUsage | null; error: string | null }> {
  const { data, error } = await supabase.rpc("household_receipt_usage", {
    p_household_id: householdId,
  });
  if (error) return { data: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : null;
  return {
    data: { files: Number(row?.files ?? 0), bytes: Number(row?.bytes ?? 0) },
    error: null,
  };
}

/**
 * Upload guard: null when the file fits, otherwise a user-facing message.
 * Fails open (allows the upload) if usage can't be read — e.g. before the
 * retention migration is applied — because the bucket's own limits still hold.
 */
export async function receiptBudgetError(
  supabase: AppSupabase,
  householdId: string,
  incomingBytes: number,
): Promise<string | null> {
  try {
    const { data, error } = await getReceiptUsage(supabase, householdId);
    if (error || !data) {
      if (error) console.warn("[receipts] usage check skipped", error);
      return null;
    }
    if (data.bytes + incomingBytes <= RECEIPTS_BUDGET_BYTES) return null;
    return `Место для чеков закончилось (${formatMegabytes(data.bytes)} из ${formatMegabytes(
      RECEIPTS_BUDGET_BYTES,
    )}). Удали старые чеки, которые больше не нужны, и попробуй снова.`;
  } catch (error) {
    console.warn("[receipts] usage check skipped", error);
    return null;
  }
}

export function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const text = mb >= 100 ? mb.toFixed(0) : mb.toFixed(1);
  return `${text.replace(".", ",")} МБ`;
}

export type HouseholdUsage = {
  receipts: ReceiptUsage | null;
  receiptsBudgetBytes: number;
  /** The viewer's own notifications (RLS hides the partner's). */
  notifications: number | null;
  auditLogs: number | null;
};

/** Cheap counts only (head requests), for the admin «Использование» card. */
export async function getHouseholdUsage(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<HouseholdUsage> {
  const [receipts, notifications, audit] = await Promise.all([
    getReceiptUsage(supabase, ctx.householdId),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("household_id", ctx.householdId)
      .eq("user_id", ctx.user.id),
    supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("household_id", ctx.householdId),
  ]);

  return {
    receipts: receipts.data,
    receiptsBudgetBytes: RECEIPTS_BUDGET_BYTES,
    notifications: notifications.error ? null : (notifications.count ?? 0),
    auditLogs: audit.error ? null : (audit.count ?? 0),
  };
}
