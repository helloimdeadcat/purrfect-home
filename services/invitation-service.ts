import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin } from "@/lib/auth/household";
import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
} from "@/lib/invitations/token";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CreateInvitationInput } from "@/lib/validations/family";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB" | "CONFLICT";
  message: string;
};

export type InvitationRow = Database["public"]["Tables"]["household_invitations"]["Row"];

const INVITE_TTL_DAYS = 7;

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

/** Map the accept RPC's English exception text (from SQL) to a Russian message. */
function translateAcceptRpcMessage(message: string): string {
  if (message.includes("expired")) return "Срок действия приглашения истёк";
  if (message.includes("already used")) return "Приглашение уже использовано";
  if (message.includes("no longer valid")) return "Приглашение больше не действует";
  if (message.includes("Not authenticated")) return "Нужно войти в аккаунт";
  return "Приглашение недействительно";
}

function isDigestRpcBroken(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    (error.message ?? "").includes("digest") ||
    (error.message ?? "").includes("preview_household_invitation") ||
    (error.message ?? "").includes("accept_household_invitation")
  );
}

/** Invitation as listed to household members — never includes token_hash. */
export type InvitationListItem = Omit<InvitationRow, "token_hash">;

export async function listInvitations(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{ data: InvitationListItem[] | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from("household_invitations")
    .select(
      "id, household_id, email, role, status, invited_by, expires_at, accepted_at, accepted_by, created_at, updated_at",
    )
    .eq("household_id", ctx.householdId)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: err("DB", error.message) };
  }

  return { data: data ?? [], error: null };
}

/**
 * Creates a pending invitation. Raw token is returned ONLY to the calling
 * owner/admin for dev delivery — never logged, never stored.
 */
export async function createInvitation(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: CreateInvitationInput,
  origin: string,
): Promise<{
  data: {
    invitation: InvitationListItem;
    inviteUrl: string;
    /** Present only in the privileged create response for owner/admin */
    deliveryMode: "dev_link";
  } | null;
  error: ServiceError | null;
}> {
  if (!canAdmin(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Приглашать могут только владелец и админы"),
    };
  }

  // Force member — never trust client-elevated roles
  if (input.role !== "member") {
    return {
      data: null,
      error: err("VALIDATION", "Через приглашение можно выдать только роль «Участник»"),
    };
  }

  const email = input.email.toLowerCase();

  if (ctx.user.email && ctx.user.email.toLowerCase() === email) {
    return {
      data: null,
      error: err("VALIDATION", "Себя пригласить нельзя 🙂"),
    };
  }

  const { data: existingMembers } = await supabase
    .from("household_members")
    .select("id, user_id")
    .eq("household_id", ctx.householdId);

  const memberUserIds = (existingMembers ?? []).map((m) => m.user_id);
  if (memberUserIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", memberUserIds);

    const alreadyIn = (profiles ?? []).some(
      (profile) => profile.email.toLowerCase() === email,
    );
    if (alreadyIn) {
      // Same message style — do not distinguish "exists elsewhere"
      return {
        data: null,
        error: err("VALIDATION", "Эту почту сейчас пригласить нельзя"),
      };
    }
  }

  const { data: pendingRows, error: pendingError } = await supabase
    .from("household_invitations")
    .select("id, expires_at")
    .eq("household_id", ctx.householdId)
    .eq("status", "pending")
    .ilike("email", email);

  if (pendingError) {
    console.error("[invite] pending lookup failed", {
      code: pendingError.code,
      message: pendingError.message,
      householdId: ctx.householdId,
    });
    return { data: null, error: err("DB", "Не получилось проверить существующие приглашения") };
  }

  const now = Date.now();
  const activePending = (pendingRows ?? []).filter(
    (row) => new Date(row.expires_at).getTime() > now,
  );
  const expiredPending = (pendingRows ?? []).filter(
    (row) => new Date(row.expires_at).getTime() <= now,
  );

  if (expiredPending.length > 0) {
    const { error: expireError } = await supabase
      .from("household_invitations")
      .update({ status: "expired" })
      .in(
        "id",
        expiredPending.map((row) => row.id),
      )
      .eq("household_id", ctx.householdId)
      .eq("status", "pending");

    if (expireError) {
      console.error("[invite] expire stale invites failed", {
        code: expireError.code,
        message: expireError.message,
        householdId: ctx.householdId,
      });
      return {
        data: null,
        error: err("DB", "Не получилось обновить истёкшие приглашения"),
      };
    }
  }

  if (activePending.length > 0) {
    return {
      data: null,
      error: err("CONFLICT", "На эту почту уже есть активное приглашение"),
    };
  }

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + INVITE_TTL_DAYS);

  const { data, error } = await supabase
    .from("household_invitations")
    .insert({
      household_id: ctx.householdId,
      email,
      role: "member",
      token_hash: tokenHash,
      status: "pending",
      invited_by: ctx.user.id,
      expires_at: expiresAt.toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    // Unique index on (household_id, lower(email)) WHERE status = 'pending'
    if (
      error?.code === "23505" ||
      (error?.message ?? "").toLowerCase().includes("duplicate") ||
      (error?.message ?? "").includes("household_invitations_pending_email")
    ) {
      return {
        data: null,
        error: err(
          "CONFLICT",
          "На эту почту уже есть активное приглашение",
        ),
      };
    }
    console.error("[invite] insert failed", {
      code: error?.code,
      message: error?.message,
      householdId: ctx.householdId,
      // Never log raw token or token_hash
    });
    return {
      data: null,
      error: err("DB", "Не получилось создать приглашение"),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { token_hash: _tokenHash, ...invitation } = data;

  return {
    data: {
      invitation,
      inviteUrl: buildInviteUrl(origin, token),
      deliveryMode: "dev_link",
    },
    error: null,
  };
}

export async function revokeInvitation(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  invitationId: string,
): Promise<{ error: ServiceError | null }> {
  if (!canAdmin(ctx.role)) {
    return { error: err("FORBIDDEN", "Отзывать приглашения могут только владелец и админы") };
  }

  const { data, error } = await supabase
    .from("household_invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("household_id", ctx.householdId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: err("DB", error.message) };
  }
  if (!data) {
    return { error: err("NOT_FOUND", "Активное приглашение не найдено") };
  }

  return { error: null };
}

export async function previewInvitation(
  supabase: AppSupabase,
  token: string,
): Promise<{
  data: {
    isValid: boolean;
    householdName: string | null;
    invitedEmail: string | null;
    expiresAt: string | null;
    status: string;
  } | null;
  error: ServiceError | null;
}> {
  const { data, error } = await supabase.rpc("preview_household_invitation", {
    p_token: token,
  });

  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as {
      is_valid: boolean;
      household_name: string | null;
      invited_email: string | null;
      expires_at: string | null;
      status: string;
    } | null;

    if (!row) {
      return {
        data: {
          isValid: false,
          householdName: null,
          invitedEmail: null,
          expiresAt: null,
          status: "invalid",
        },
        error: null,
      };
    }

    return {
      data: {
        isValid: row.is_valid,
        householdName: row.household_name,
        invitedEmail: row.invited_email,
        expiresAt: row.expires_at,
        status: row.status,
      },
      error: null,
    };
  }

  if (!isDigestRpcBroken(error)) {
    return { data: null, error: err("DB", error.message) };
  }

  // Fallback: hash in Node + service-role lookup (invitee is not a member yet).
  return previewInvitationViaAdmin(token);
}

async function previewInvitationViaAdmin(token: string): Promise<{
  data: {
    isValid: boolean;
    householdName: string | null;
    invitedEmail: string | null;
    expiresAt: string | null;
    status: string;
  } | null;
  error: ServiceError | null;
}> {
  if (!token || token.trim().length < 20) {
    return {
      data: {
        isValid: false,
        householdName: null,
        invitedEmail: null,
        expiresAt: null,
        status: "invalid",
      },
      error: null,
    };
  }

  const admin = createAdminClient();
  const tokenHash = hashInviteToken(token.trim());

  const { data: invite, error } = await admin
    .from("household_invitations")
    .select("email, status, expires_at, household_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    return { data: null, error: err("DB", error.message) };
  }

  if (!invite) {
    return {
      data: {
        isValid: false,
        householdName: null,
        invitedEmail: null,
        expiresAt: null,
        status: "invalid",
      },
      error: null,
    };
  }

  const { data: household } = await admin
    .from("households")
    .select("name")
    .eq("id", invite.household_id)
    .maybeSingle();

  const expired =
    invite.status === "pending" &&
    new Date(invite.expires_at).getTime() <= Date.now();
  const status = expired ? "expired" : invite.status;

  return {
    data: {
      isValid: invite.status === "pending" && !expired,
      householdName: household?.name ?? null,
      invitedEmail: invite.email.toLowerCase(),
      expiresAt: invite.expires_at,
      status,
    },
    error: null,
  };
}

export async function acceptInvitation(
  supabase: AppSupabase,
  token: string,
  user: User,
): Promise<{
  data: {
    householdId: string;
    memberId: string;
    alreadyMember: boolean;
  } | null;
  error: ServiceError | null;
}> {
  const { data, error } = await supabase.rpc("accept_household_invitation", {
    p_token: token,
  });

  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as {
      household_id: string;
      member_id: string;
      already_member: boolean;
    } | null;

    if (!row?.household_id) {
      return { data: null, error: err("VALIDATION", "Приглашение недействительно") };
    }

    return {
      data: {
        householdId: row.household_id,
        memberId: row.member_id,
        alreadyMember: Boolean(row.already_member),
      },
      error: null,
    };
  }

  if (isDigestRpcBroken(error)) {
    return acceptInvitationViaAdmin(token, user);
  }

  const message = error.message || "Invalid invitation";
  if (
    message.includes("expired") ||
    message.includes("already used") ||
    message.includes("no longer valid") ||
    message.includes("Invalid invitation") ||
    message.includes("Not authenticated")
  ) {
    return { data: null, error: err("VALIDATION", translateAcceptRpcMessage(message)) };
  }
  return { data: null, error: err("DB", "Не получилось принять приглашение") };
}

/**
 * Server-only accept path when Postgres digest()/RPC is unavailable.
 * Uses optimistic claim on status=pending so concurrent accepts cannot both succeed.
 */
async function acceptInvitationViaAdmin(
  token: string,
  user: User,
): Promise<{
  data: {
    householdId: string;
    memberId: string;
    alreadyMember: boolean;
  } | null;
  error: ServiceError | null;
}> {
  const email = user.email?.trim().toLowerCase();
  if (!email) {
    return { data: null, error: err("VALIDATION", "Приглашение недействительно") };
  }
  if (!token || token.trim().length < 20) {
    return { data: null, error: err("VALIDATION", "Приглашение недействительно") };
  }

  const admin = createAdminClient();
  const tokenHash = hashInviteToken(token.trim());

  const { data: invite, error: lookupError } = await admin
    .from("household_invitations")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (lookupError) {
    return { data: null, error: err("DB", lookupError.message) };
  }
  if (!invite) {
    return { data: null, error: err("VALIDATION", "Приглашение недействительно") };
  }

  if (invite.status === "accepted") {
    const { data: existing } = await admin
      .from("household_members")
      .select("id")
      .eq("household_id", invite.household_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) {
      return {
        data: {
          householdId: invite.household_id,
          memberId: existing.id,
          alreadyMember: true,
        },
        error: null,
      };
    }
    return { data: null, error: err("VALIDATION", "Приглашение уже использовано") };
  }

  if (invite.status !== "pending") {
    return { data: null, error: err("VALIDATION", "Приглашение больше не действует") };
  }

  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    await admin
      .from("household_invitations")
      .update({ status: "expired" })
      .eq("id", invite.id)
      .eq("status", "pending");
    return { data: null, error: err("VALIDATION", "Срок действия приглашения истёк") };
  }

  if (invite.email.toLowerCase() !== email) {
    return { data: null, error: err("VALIDATION", "Приглашение недействительно") };
  }

  if (invite.role !== "member") {
    return { data: null, error: err("VALIDATION", "Приглашение недействительно") };
  }

  const { data: existingMember } = await admin
    .from("household_members")
    .select("id")
    .eq("household_id", invite.household_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMember) {
    await admin
      .from("household_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: user.id,
      })
      .eq("id", invite.id)
      .eq("status", "pending");

    return {
      data: {
        householdId: invite.household_id,
        memberId: existingMember.id,
        alreadyMember: true,
      },
      error: null,
    };
  }

  // Claim invitation first (optimistic lock) before inserting membership.
  const { data: claimed, error: claimError } = await admin
    .from("household_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
    })
    .eq("id", invite.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (claimError) {
    return { data: null, error: err("DB", claimError.message) };
  }
  if (!claimed) {
    return { data: null, error: err("VALIDATION", "Приглашение уже использовано") };
  }

  const { data: member, error: memberError } = await admin
    .from("household_members")
    .insert({
      household_id: invite.household_id,
      user_id: user.id,
      role: "member",
      display_name: email.split("@")[0] ?? null,
    })
    .select("id")
    .single();

  if (memberError || !member) {
    // Best-effort rollback of claim if membership insert failed
    await admin
      .from("household_invitations")
      .update({
        status: "pending",
        accepted_at: null,
        accepted_by: null,
      })
      .eq("id", invite.id)
      .eq("status", "accepted")
      .eq("accepted_by", user.id);
    return {
      data: null,
      error: err("DB", memberError?.message ?? "Не получилось присоединиться к семье"),
    };
  }

  await admin.from("profiles").upsert(
    { id: user.id, email },
    { onConflict: "id" },
  );

  return {
    data: {
      householdId: invite.household_id,
      memberId: member.id,
      alreadyMember: false,
    },
    error: null,
  };
}
