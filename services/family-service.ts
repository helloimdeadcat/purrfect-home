import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin } from "@/lib/auth/household";
import type { UpdateHouseholdInput } from "@/lib/validations/family";
import type { Database, HouseholdRole } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB";
  message: string;
};

export type FamilyMemberRow = {
  id: string;
  user_id: string;
  role: HouseholdRole;
  display_name: string | null;
  joined_at: string;
  email: string | null;
};

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

export async function listFamilyMembers(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{ data: FamilyMemberRow[] | null; error: ServiceError | null }> {
  const { data: members, error } = await supabase
    .from("household_members")
    .select("id, user_id, role, display_name, joined_at")
    .eq("household_id", ctx.householdId)
    .order("joined_at", { ascending: true });

  if (error) {
    return { data: null, error: err("DB", error.message) };
  }

  const userIds = (members ?? []).map((member) => member.user_id);
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase.from("profiles").select("id, email").in("id", userIds)
    : { data: [], error: null };

  if (profilesError) {
    return { data: null, error: err("DB", profilesError.message) };
  }

  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  return {
    data: (members ?? []).map((member) => ({
      ...member,
      email: emailById.get(member.user_id) ?? null,
    })),
    error: null,
  };
}

export async function updateHouseholdName(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: UpdateHouseholdInput,
): Promise<{ data: { id: string; name: string } | null; error: ServiceError | null }> {
  if (!canAdmin(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Переименовать семью могут только владелец и админы"),
    };
  }

  const { data, error } = await supabase
    .from("households")
    .update({ name: input.name })
    .eq("id", ctx.householdId)
    .select("id, name")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Не получилось обновить семью"),
    };
  }

  return { data, error: null };
}
