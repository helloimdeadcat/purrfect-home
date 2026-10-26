import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin, canWrite } from "@/lib/auth/household";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RECEIPT_SIGNED_URL_TTL_SECONDS,
  RECEIPTS_BUCKET,
  buildReceiptStoragePath,
} from "@/lib/supabase/storage";
import {
  MAX_RECEIPTS_PER_TRANSACTION,
  sanitizeReceiptFileName,
  validateReceiptBytes,
} from "@/lib/validations/receipt";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB" | "CONFLICT";
  message: string;
};

export type ReceiptRow = Database["public"]["Tables"]["receipts"]["Row"];

/** What the UI gets — the storage path stays server-side. */
export type ReceiptView = Omit<ReceiptRow, "storage_path"> & {
  canDelete: boolean;
};

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

function toView(row: ReceiptRow, ctx: HouseholdContext): ReceiptView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { storage_path: _path, ...rest } = row;
  return {
    ...rest,
    canDelete:
      canAdmin(ctx.role) ||
      (canWrite(ctx.role) && row.uploaded_by === ctx.user.id),
  };
}

async function loadEditableTransaction(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  transactionId: string,
): Promise<{ error: ServiceError | null }> {
  const { data: tx, error } = await supabase
    .from("transactions")
    .select("id, created_by")
    .eq("id", transactionId)
    .eq("household_id", ctx.householdId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { error: err("DB", error.message) };
  if (!tx) return { error: err("NOT_FOUND", "Transaction not found") };

  // Same rule as editing the transaction itself.
  if (ctx.role === "member" && tx.created_by !== ctx.user.id) {
    return {
      error: err("FORBIDDEN", "Members can only attach receipts to their own transactions"),
    };
  }
  return { error: null };
}

export async function listReceiptsForTransactions(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  transactionIds: string[],
): Promise<{ data: Map<string, ReceiptView[]> | null; error: ServiceError | null }> {
  const byTransaction = new Map<string, ReceiptView[]>();
  if (transactionIds.length === 0) {
    return { data: byTransaction, error: null };
  }

  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("household_id", ctx.householdId)
    .in("transaction_id", transactionIds)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: err("DB", error.message) };

  for (const row of data ?? []) {
    const list = byTransaction.get(row.transaction_id) ?? [];
    list.push(toView(row, ctx));
    byTransaction.set(row.transaction_id, list);
  }
  return { data: byTransaction, error: null };
}

export async function uploadReceipt(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  transactionId: string,
  file: { bytes: Uint8Array; fileName: string | null },
): Promise<{ data: ReceiptView | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { data: null, error: err("FORBIDDEN", "Viewers cannot upload receipts") };
  }

  const check = validateReceiptBytes(file.bytes);
  if (!check.ok) {
    return { data: null, error: err("VALIDATION", check.message) };
  }

  const txCheck = await loadEditableTransaction(supabase, ctx, transactionId);
  if (txCheck.error) return { data: null, error: txCheck.error };

  const { count, error: countError } = await supabase
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .eq("household_id", ctx.householdId)
    .eq("transaction_id", transactionId);
  if (countError) return { data: null, error: err("DB", countError.message) };
  if ((count ?? 0) >= MAX_RECEIPTS_PER_TRANSACTION) {
    return {
      data: null,
      error: err(
        "VALIDATION",
        `A transaction can have at most ${MAX_RECEIPTS_PER_TRANSACTION} receipts`,
      ),
    };
  }

  const storagePath = buildReceiptStoragePath({
    householdId: ctx.householdId,
    transactionId,
    objectId: randomUUID(),
    extension: check.kind.extension,
  });

  const { error: uploadError } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(storagePath, file.bytes, {
      contentType: check.kind.mimeType,
      upsert: false,
    });
  if (uploadError) {
    return { data: null, error: err("DB", "Could not store the file") };
  }

  const { data: row, error: insertError } = await supabase
    .from("receipts")
    .insert({
      household_id: ctx.householdId,
      transaction_id: transactionId,
      storage_path: storagePath,
      file_name: sanitizeReceiptFileName(file.fileName),
      mime_type: check.kind.mimeType,
      file_size: check.size,
      uploaded_by: ctx.user.id,
    })
    .select("*")
    .single();

  if (insertError || !row) {
    // The object we just wrote has no metadata row and would be an
    // unreachable orphan. Members have no storage DELETE right, so this one
    // cleanup uses the service role — scoped to the exact path this request
    // created, after RLS already authorised the upload.
    await createAdminClient().storage.from(RECEIPTS_BUCKET).remove([storagePath]);
    return { data: null, error: err("DB", "Could not save the receipt") };
  }

  return { data: toView(row, ctx), error: null };
}

export async function getReceiptDownloadUrl(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  receiptId: string,
): Promise<{ data: string | null; error: ServiceError | null }> {
  const { data: row, error } = await supabase
    .from("receipts")
    .select("storage_path, file_name")
    .eq("id", receiptId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (error) return { data: null, error: err("DB", error.message) };
  if (!row) return { data: null, error: err("NOT_FOUND", "Receipt not found") };

  // Signed with the user's session, so storage RLS is checked again here.
  const { data, error: signError } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(row.storage_path, RECEIPT_SIGNED_URL_TTL_SECONDS, {
      download: row.file_name,
    });
  if (signError || !data?.signedUrl) {
    return { data: null, error: err("NOT_FOUND", "Receipt file is unavailable") };
  }
  return { data: data.signedUrl, error: null };
}

export async function deleteReceipt(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  receiptId: string,
): Promise<{ error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { error: err("FORBIDDEN", "Viewers cannot delete receipts") };
  }

  const { data: row, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", receiptId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (error) return { error: err("DB", error.message) };
  if (!row) return { error: err("NOT_FOUND", "Receipt not found") };
  if (!toView(row, ctx).canDelete) {
    return {
      error: err("FORBIDDEN", "Only the uploader or an owner/admin can delete this receipt"),
    };
  }

  // File first: if this fails the metadata row still points at a real file
  // and the user can retry. (Storage policy checks the receipts row, so the
  // row must still exist at this point.)
  const { data: removed, error: removeError } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .remove([row.storage_path]);
  if (removeError) {
    return { error: err("DB", "Could not delete the file") };
  }
  if ((removed ?? []).length === 0) {
    // Already gone (or not visible) — still drop the dangling row below.
    console.warn("[receipts] storage object missing on delete", { receiptId });
  }

  const { error: deleteError } = await supabase
    .from("receipts")
    .delete()
    .eq("id", receiptId)
    .eq("household_id", ctx.householdId);
  if (deleteError) {
    return { error: err("DB", deleteError.message) };
  }

  return { error: null };
}
