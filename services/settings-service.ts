import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin } from "@/lib/auth/household";
import { todayInTimezone } from "@/lib/calculations/timezone-date";
import type {
  UpdateHouseholdSettingsInput,
  UpdateProfileInput,
} from "@/lib/validations/settings";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB";
  message: string;
};

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type HouseholdSettingsRow =
  Database["public"]["Tables"]["household_settings"]["Row"];

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

export async function getOwnProfile(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{ data: ProfileRow | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", ctx.user.id)
    .maybeSingle();

  if (error) return { data: null, error: err("DB", error.message) };
  if (!data) return { data: null, error: err("NOT_FOUND", "Profile not found") };
  return { data, error: null };
}

export async function updateOwnProfile(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: UpdateProfileInput,
): Promise<{ data: ProfileRow | null; error: ServiceError | null }> {
  const patch: Database["public"]["Tables"]["profiles"]["Update"] = {};
  if (input.firstName !== undefined) patch.first_name = input.firstName;
  if (input.lastName !== undefined) patch.last_name = input.lastName;
  if (input.currency !== undefined) patch.currency = input.currency;

  if (Object.keys(patch).length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", ctx.user.id)
      .select("*")
      .single();
    if (error || !data) {
      return {
        data: null,
        error: err("DB", error?.message ?? "Failed to update profile"),
      };
    }

    if (input.displayName !== undefined) {
      const { error: memberError } = await supabase
        .from("household_members")
        .update({ display_name: input.displayName })
        .eq("id", ctx.membershipId)
        .eq("household_id", ctx.householdId);
      if (memberError) {
        return { data: null, error: err("DB", memberError.message) };
      }
    }

    return { data, error: null };
  }

  if (input.displayName !== undefined) {
    const { error: memberError } = await supabase
      .from("household_members")
      .update({ display_name: input.displayName })
      .eq("id", ctx.membershipId)
      .eq("household_id", ctx.householdId);
    if (memberError) {
      return { data: null, error: err("DB", memberError.message) };
    }
  }

  return getOwnProfile(supabase, ctx);
}

export async function getHouseholdSettings(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{ data: HouseholdSettingsRow | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from("household_settings")
    .select("*")
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (error) return { data: null, error: err("DB", error.message) };
  if (!data) {
    return {
      data: null,
      error: err("NOT_FOUND", "Household settings not found"),
    };
  }
  return { data, error: null };
}

/**
 * "Today" as the household sees it. Every period boundary (current month,
 * overdue, default budget month) must use this rather than the server's UTC
 * date, otherwise late-evening / just-after-midnight views land in the wrong
 * day or month. Falls back to UTC when settings are missing or invalid.
 */
export async function getHouseholdToday(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  now: Date = new Date(),
): Promise<{ timezone: string; today: string }> {
  const settings = await getHouseholdSettings(supabase, ctx);
  return householdTodayFromSettings(settings.data, now);
}

/** Same as getHouseholdToday when the settings row is already loaded. */
export function householdTodayFromSettings(
  settings: Pick<HouseholdSettingsRow, "timezone"> | null,
  now: Date = new Date(),
): { timezone: string; today: string } {
  const timezone =
    settings?.timezone && settings.timezone.length > 0 ? settings.timezone : "UTC";
  return { timezone, today: todayInTimezone(timezone, now) };
}

export async function updateHouseholdSettings(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: UpdateHouseholdSettingsInput,
): Promise<{ data: HouseholdSettingsRow | null; error: ServiceError | null }> {
  if (!canAdmin(ctx.role)) {
    return {
      data: null,
      error: err(
        "FORBIDDEN",
        "Only owners and admins can change household settings",
      ),
    };
  }

  if (input.defaultAccountId) {
    const { data: account, error } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", input.defaultAccountId)
      .eq("household_id", ctx.householdId)
      .maybeSingle();
    if (error) return { data: null, error: err("DB", error.message) };
    if (!account) {
      return { data: null, error: err("VALIDATION", "Default account not found") };
    }
  }

  if (input.defaultCategoryId) {
    const { data: category, error } = await supabase
      .from("categories")
      .select("id, household_id")
      .eq("id", input.defaultCategoryId)
      .maybeSingle();
    if (error) return { data: null, error: err("DB", error.message) };
    if (!category || category.household_id !== ctx.householdId) {
      return {
        data: null,
        error: err("VALIDATION", "Default category not found"),
      };
    }
  }

  const patch: Database["public"]["Tables"]["household_settings"]["Update"] =
    {};
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.weekStartsOn !== undefined) patch.week_starts_on = input.weekStartsOn;
  if (input.monthStartsOn !== undefined) {
    patch.month_starts_on = input.monthStartsOn;
  }
  if (input.defaultAccountId !== undefined) {
    patch.default_account_id = input.defaultAccountId;
  }
  if (input.defaultCategoryId !== undefined) {
    patch.default_category_id = input.defaultCategoryId;
  }
  if (input.safeToSpendReserves !== undefined) {
    patch.safe_to_spend_reserves = input.safeToSpendReserves;
  }

  const { data, error } = await supabase
    .from("household_settings")
    .update(patch)
    .eq("household_id", ctx.householdId)
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Failed to update settings"),
    };
  }
  return { data, error: null };
}
