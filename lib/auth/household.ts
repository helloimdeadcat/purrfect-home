import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getPreferredHouseholdId } from "@/lib/auth/active-household";
import type { Database, HouseholdRole } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type HouseholdContext = {
  user: User;
  membershipId: string;
  householdId: string;
  role: HouseholdRole;
  displayName: string | null;
  currency: string;
  householdName: string;
};

export async function getHouseholdContext(
  supabase: AppSupabase,
  user: User,
): Promise<{ data: HouseholdContext | null; error: string | null }> {
  const preferredHouseholdId = await getPreferredHouseholdId();

  let membership: {
    id: string;
    household_id: string;
    role: HouseholdRole;
    display_name: string | null;
  } | null = null;
  let membershipError: { message: string } | null = null;

  if (preferredHouseholdId) {
    const preferred = await supabase
      .from("household_members")
      .select("id, household_id, role, display_name")
      .eq("user_id", user.id)
      .eq("household_id", preferredHouseholdId)
      .maybeSingle();
    membership = preferred.data;
    membershipError = preferred.error;
  }

  if (!membership && !membershipError) {
    // Prefer the most recently joined household when no active-household cookie
    // is set (e.g. after accepting an invite into a spouse's household).
    const fallback = await supabase
      .from("household_members")
      .select("id, household_id, role, display_name")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    membership = fallback.data;
    membershipError = fallback.error;
  }

  if (membershipError) {
    return { data: null, error: membershipError.message };
  }

  if (!membership) {
    return { data: null, error: "Ты пока не состоишь ни в одной семье" };
  }

  const { data: household, error: householdError } = await supabase
    .from("households")
    .select("id, name, base_currency")
    .eq("id", membership.household_id)
    .maybeSingle();

  if (householdError || !household) {
    return {
      data: null,
      error: householdError?.message ?? "Семья не найдена",
    };
  }

  return {
    data: {
      user,
      membershipId: membership.id,
      householdId: household.id,
      role: membership.role,
      displayName: membership.display_name,
      currency: household.base_currency,
      householdName: household.name,
    },
    error: null,
  };
}

export function canWrite(role: HouseholdRole): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export function canAdmin(role: HouseholdRole): boolean {
  return role === "owner" || role === "admin";
}
