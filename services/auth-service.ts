import type { User } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { RegisterInput } from "@/lib/validations/auth";

export type AuthServiceError = {
  code: "VALIDATION" | "AUTH" | "BOOTSTRAP" | "UNKNOWN";
  message: string;
};

export type BootstrapResult = {
  householdId: string;
  memberId: string;
  created: boolean;
};

function asError(code: AuthServiceError["code"], message: string): AuthServiceError {
  return { code, message };
}

type BootstrapRpcRow = {
  household_id: string;
  member_id: string;
  created: boolean;
};

/**
 * Ensures profile + first household + owner membership + default categories exist.
 *
 * Uses a SECURITY DEFINER RPC with a transaction-scoped advisory lock so parallel
 * login/register cannot create two "first" households for the same user.
 * Users may still join additional households later via invites (not unique-per-user).
 *
 * Admin/service-role client is server-only and only used after the user is authenticated
 * (session present) or during trusted server bootstrap after sign-in.
 */
export async function ensureUserBootstrap(
  user: User,
  options?: Partial<
    Pick<RegisterInput, "firstName" | "lastName" | "householdName" | "currency">
  >,
): Promise<{ data: BootstrapResult | null; error: AuthServiceError | null }> {
  const email = user.email;
  if (!email) {
    return { data: null, error: asError("BOOTSTRAP", "У аккаунта нет почты") };
  }

  const admin = createAdminClient();

  const meta = user.user_metadata ?? {};
  const firstName =
    options?.firstName ??
    (typeof meta.first_name === "string" ? meta.first_name : null);
  const lastName =
    options?.lastName ??
    (typeof meta.last_name === "string" ? meta.last_name : null);
  const currency = (
    options?.currency ??
    (typeof meta.currency === "string" ? meta.currency : "EUR")
  ).toUpperCase();
  const householdName =
    options?.householdName?.trim() ||
    (typeof meta.household_name === "string" && meta.household_name.trim()
      ? meta.household_name.trim()
      : "Наша семья");

  const { data, error } = await admin.rpc("bootstrap_first_household_for_user", {
    p_user_id: user.id,
    p_email: email,
    p_first_name: firstName,
    p_last_name: lastName,
    p_household_name: householdName,
    p_currency: currency,
  });

  if (error) {
    // Fallback while migration is not yet applied on remote
    if (
      error.message.includes("bootstrap_first_household_for_user") ||
      error.code === "PGRST202" ||
      error.code === "42883"
    ) {
      return legacyEnsureUserBootstrap(user, {
        firstName,
        lastName,
        householdName,
        currency,
      });
    }
    return {
      data: null,
      error: asError("BOOTSTRAP", `Не получилось подготовить семью: ${error.message}`),
    };
  }

  const row = (Array.isArray(data) ? data[0] : data) as BootstrapRpcRow | null;
  if (!row?.household_id || !row?.member_id) {
    return {
      data: null,
      error: asError("BOOTSTRAP", "Не получилось создать семью"),
    };
  }

  return {
    data: {
      householdId: row.household_id,
      memberId: row.member_id,
      created: Boolean(row.created),
    },
    error: null,
  };
}

/**
 * Legacy path used only if the new RPC migration is not applied yet.
 * Still server-only via admin client.
 */
async function legacyEnsureUserBootstrap(
  user: User,
  options: {
    firstName: string | null;
    lastName: string | null;
    householdName: string;
    currency: string;
  },
): Promise<{ data: BootstrapResult | null; error: AuthServiceError | null }> {
  const admin = createAdminClient();
  const email = user.email!;

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: user.id,
      email,
      first_name: options.firstName,
      last_name: options.lastName,
      currency: options.currency,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    return {
      data: null,
      error: asError("BOOTSTRAP", `Не получилось создать профиль: ${profileError.message}`),
    };
  }

  const { data: existingMember, error: memberLookupError } = await admin
    .from("household_members")
    .select("id, household_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberLookupError) {
    return {
      data: null,
      error: asError(
        "BOOTSTRAP",
        `Не получилось проверить участие в семье: ${memberLookupError.message}`,
      ),
    };
  }

  if (existingMember) {
    return {
      data: {
        householdId: existingMember.household_id,
        memberId: existingMember.id,
        created: false,
      },
      error: null,
    };
  }

  return {
    data: null,
    error: asError(
      "BOOTSTRAP",
      "Чтобы создать новую семью, нужна миграция базы 20261017150000_audit_security_integrity_fixes.sql. Примени её в Supabase и войди снова.",
    ),
  };
}
