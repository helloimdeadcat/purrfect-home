import type { SupabaseClient } from "@supabase/supabase-js";

import { RECEIPTS_BUCKET } from "@/lib/supabase/storage";
import type { Database } from "@/types/database";

/**
 * Daily housekeeping that keeps the app inside the Supabase Free tier.
 * SERVER ONLY — expects the service-role client (createAdminClient()).
 *
 * 1. Receipt files: Storage objects can only be removed through the Storage
 *    API, so the database lists what is purgeable
 *    (list_purgeable_receipt_files) — receipts of transactions soft-deleted
 *    more than 30 days ago, plus orphaned objects older than a day — and
 *    this service removes the files in batches, then deletes the rows.
 *    File first: if Storage fails, the rows stay and the next run retries.
 * 2. Row retention (cleanup_expired_data): old notifications, audit rows,
 *    finished invitations, long soft-deleted transactions. Runs after step 1
 *    so transactions whose receipts were just purged can go in the same run.
 *
 * Errors never throw: they are logged and counted in `errors`, so one
 * failing step does not block the other. The caller (daily cron) can turn
 * `errors > 0` into a non-200 response.
 */

type AdminClient = SupabaseClient<Database>;

/** Storage `remove` and the `in.(...)` filter both stay small at 100. */
export const RECEIPT_PURGE_BATCH_SIZE = 100;
/** Hard stop per run (2 000 files) so one cron call stays short. */
export const RECEIPT_PURGE_MAX_BATCHES = 20;

type PurgeCounts = {
  receipt_files_removed: number;
  receipt_rows_deleted: number;
  errors: number;
};

async function purgeReceiptFiles(admin: AdminClient): Promise<PurgeCounts> {
  const counts: PurgeCounts = { receipt_files_removed: 0, receipt_rows_deleted: 0, errors: 0 };

  for (let batch = 0; batch < RECEIPT_PURGE_MAX_BATCHES; batch += 1) {
    const { data, error } = await admin.rpc("list_purgeable_receipt_files", {
      p_limit: RECEIPT_PURGE_BATCH_SIZE,
    });
    if (error) {
      console.error("[maintenance] list_purgeable_receipt_files failed", error.message);
      counts.errors += 1;
      break;
    }
    const items = data ?? [];
    if (items.length === 0) break;

    const { data: removed, error: removeError } = await admin.storage
      .from(RECEIPTS_BUCKET)
      .remove(items.map((item) => item.storage_path));
    if (removeError) {
      // Keep the rows: they still point at real files and the next run retries.
      console.error("[maintenance] receipt file removal failed", removeError.message);
      counts.errors += 1;
      break;
    }
    const removedCount = removed?.length ?? 0;
    counts.receipt_files_removed += removedCount;

    const receiptIds = items
      .map((item) => item.receipt_id)
      .filter((id): id is string => typeof id === "string");
    if (receiptIds.length > 0) {
      // A file that was already missing still lets its row go.
      const { error: deleteError, count } = await admin
        .from("receipts")
        .delete({ count: "exact" })
        .in("id", receiptIds);
      if (deleteError) {
        console.error("[maintenance] receipt row delete failed", deleteError.message);
        counts.errors += 1;
        break;
      }
      counts.receipt_rows_deleted += count ?? receiptIds.length;
    } else if (removedCount === 0) {
      // Only orphaned objects and none could be removed — no progress
      // possible this run; stop instead of listing the same paths again.
      break;
    }

    if (items.length < RECEIPT_PURGE_BATCH_SIZE) break;
  }

  return counts;
}

function toCounts(value: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, raw] of Object.entries(value)) {
      const n = Number(raw);
      if (Number.isFinite(n)) counts[key] = n;
    }
  }
  return counts;
}

export async function runDailyCleanup(admin: AdminClient): Promise<Record<string, number>> {
  const result: Record<string, number> = { ...(await purgeReceiptFiles(admin)) };

  const { data, error } = await admin.rpc("cleanup_expired_data");
  if (error) {
    console.error("[maintenance] cleanup_expired_data failed", error.message);
    result.errors += 1;
  } else {
    Object.assign(result, toCounts(data));
  }

  return result;
}
