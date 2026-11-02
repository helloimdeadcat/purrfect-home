import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin, canWrite } from "@/lib/auth/household";
import type { CreateTagInput, UpdateTagInput } from "@/lib/validations/settings";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB" | "CONFLICT";
  message: string;
};

export type TagRow = Database["public"]["Tables"]["tags"]["Row"] & {
  is_active: boolean;
};

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function listTags(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  options?: { includeInactive?: boolean },
): Promise<{ data: TagRow[] | null; error: ServiceError | null }> {
  let query = supabase
    .from("tags")
    .select("*")
    .eq("household_id", ctx.householdId)
    .order("name", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    return { data: null, error: err("DB", error.message) };
  }
  return { data: (data ?? []) as TagRow[], error: null };
}

export async function createTag(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: CreateTagInput,
): Promise<{ data: TagRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Наблюдатели не могут создавать метки"),
    };
  }

  const name = normalizeName(input.name);
  const { data, error } = await supabase
    .from("tags")
    .insert({
      household_id: ctx.householdId,
      name,
      color: input.color ?? null,
      is_active: true,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return {
        data: null,
        error: err("CONFLICT", "Метка с таким названием уже есть"),
      };
    }
    return {
      data: null,
      error: err("DB", error?.message ?? "Не получилось создать метку"),
    };
  }
  return { data: data as TagRow, error: null };
}

export async function updateTag(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  tagId: string,
  input: UpdateTagInput,
): Promise<{ data: TagRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Наблюдатели не могут менять метки"),
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("tags")
    .select("*")
    .eq("id", tagId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { data: null, error: err("NOT_FOUND", "Метка не найдена") };
  }

  const patch: Database["public"]["Tables"]["tags"]["Update"] = {};
  if (input.name !== undefined) patch.name = normalizeName(input.name);
  if (input.color !== undefined) patch.color = input.color;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await supabase
    .from("tags")
    .update(patch)
    .eq("id", tagId)
    .eq("household_id", ctx.householdId)
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return {
        data: null,
        error: err("CONFLICT", "Метка с таким названием уже есть"),
      };
    }
    return {
      data: null,
      error: err("DB", error?.message ?? "Не получилось обновить метку"),
    };
  }
  return { data: data as TagRow, error: null };
}

/** Hard-delete when unused; otherwise archive. Keeps transaction_tags. */
export async function archiveOrDeleteTag(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  tagId: string,
): Promise<{ data: { archived: boolean } | null; error: ServiceError | null }> {
  if (!canAdmin(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Удалять метки могут только владелец и админы"),
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("tags")
    .select("id")
    .eq("id", tagId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { data: null, error: err("NOT_FOUND", "Метка не найдена") };
  }

  const { count, error: countError } = await supabase
    .from("transaction_tags")
    .select("tag_id", { count: "exact", head: true })
    .eq("tag_id", tagId);

  if (countError) {
    return { data: null, error: err("DB", countError.message) };
  }

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("tags")
      .update({ is_active: false })
      .eq("id", tagId)
      .eq("household_id", ctx.householdId);
    if (error) return { data: null, error: err("DB", error.message) };
    return { data: { archived: true }, error: null };
  }

  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("id", tagId)
    .eq("household_id", ctx.householdId);
  if (error) return { data: null, error: err("DB", error.message) };
  return { data: { archived: false }, error: null };
}

export async function setTransactionTags(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  transactionId: string,
  tagIds: string[],
): Promise<{ error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return { error: err("FORBIDDEN", "Наблюдатели не могут ставить метки операциям") };
  }

  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .select("id")
    .eq("id", transactionId)
    .eq("household_id", ctx.householdId)
    .is("deleted_at", null)
    .maybeSingle();

  if (txError) return { error: err("DB", txError.message) };
  if (!tx) return { error: err("NOT_FOUND", "Операция не найдена") };

  const uniqueIds = [...new Set(tagIds)];
  if (uniqueIds.length > 0) {
    const { data: tags, error: tagsError } = await supabase
      .from("tags")
      .select("id, is_active")
      .eq("household_id", ctx.householdId)
      .in("id", uniqueIds);

    if (tagsError) return { error: err("DB", tagsError.message) };
    if ((tags ?? []).length !== uniqueIds.length) {
      return { error: err("VALIDATION", "Некоторые метки не найдены") };
    }
    if ((tags ?? []).some((tag) => !(tag as { is_active?: boolean }).is_active)) {
      return { error: err("VALIDATION", "Нельзя поставить метку из архива") };
    }
  }

  const { error: delError } = await supabase
    .from("transaction_tags")
    .delete()
    .eq("transaction_id", transactionId);
  if (delError) return { error: err("DB", delError.message) };

  if (uniqueIds.length === 0) return { error: null };

  const { error: insError } = await supabase.from("transaction_tags").insert(
    uniqueIds.map((tag_id) => ({
      transaction_id: transactionId,
      tag_id,
    })),
  );
  if (insError) return { error: err("DB", insError.message) };
  return { error: null };
}

export async function listTagsForTransaction(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  transactionId: string,
): Promise<{ data: TagRow[] | null; error: ServiceError | null }> {
  const { data: links, error } = await supabase
    .from("transaction_tags")
    .select("tag_id")
    .eq("transaction_id", transactionId);

  if (error) return { data: null, error: err("DB", error.message) };
  const ids = (links ?? []).map((link) => link.tag_id);
  if (ids.length === 0) return { data: [], error: null };

  const { data, error: tagsError } = await supabase
    .from("tags")
    .select("*")
    .eq("household_id", ctx.householdId)
    .in("id", ids);

  if (tagsError) return { data: null, error: err("DB", tagsError.message) };
  return { data: (data ?? []) as TagRow[], error: null };
}
