import { redirect } from "next/navigation";

import { InviteMemberForm } from "@/components/family/invite-member-form";
import { RenameHouseholdForm } from "@/components/family/rename-household-form";
import { RevokeInvitationButton } from "@/components/family/revoke-invitation-button";
import { canAdmin, getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { listFamilyMembers } from "@/services/family-service";
import { listInvitations } from "@/services/invitation-service";
import { LOCALE } from "@/lib/locale";

const ROLE_LABELS: Record<string, string> = {
  owner: "Владелец",
  admin: "Админ",
  member: "Участник",
  viewer: "Наблюдатель",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает",
  accepted: "Принято",
  revoked: "Отозвано",
  expired: "Истекло",
};

function statusLabel(status: string, expiresAt: string): string {
  const effective =
    status === "pending" && new Date(expiresAt) <= new Date() ? "expired" : status;
  return STATUS_LABELS[effective] ?? effective;
}

export default async function FamilyPage() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const { data: ctx, error: ctxError } = await getHouseholdContext(
    supabase,
    user,
  );
  if (!ctx) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Семья</h1>
        <p className="text-sm text-destructive" role="alert">
          {ctxError ?? "Нет доступа к семье"}
        </p>
      </div>
    );
  }

  const manage = canAdmin(ctx.role);

  const [membersResult, invitationsResult] = await Promise.all([
    listFamilyMembers(supabase, ctx),
    listInvitations(supabase, ctx),
  ]);

  const members = membersResult.data ?? [];
  const invitations = invitationsResult.data ?? [];
  const loadError = membersResult.error?.message ?? invitationsResult.error?.message;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Семья</h1>
        <p className="text-muted-foreground">
          Участники твоей семьи и приглашения.
        </p>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      <section className="grid gap-1">
        <h2 className="text-lg font-medium">{ctx.householdName}</h2>
        <p className="text-sm text-muted-foreground">
          Твоя роль: {roleLabel(ctx.role)} · Основная валюта: {ctx.currency}
        </p>
      </section>

      {manage ? <RenameHouseholdForm currentName={ctx.householdName} /> : null}

      <section className="grid gap-3">
        <h2 className="font-medium">Участники</h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Участников пока нет.</p>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between gap-4 card-soft px-4 py-3"
            >
              <div>
                <p className="font-medium">
                  {member.display_name ?? member.email ?? "Участник"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {member.email ?? "Без почты"} · {roleLabel(member.role)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Активен</p>
            </div>
          ))
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium">Приглашения</h2>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Приглашений пока нет.
          </p>
        ) : (
          invitations.map((invite) => {
            const label = statusLabel(invite.status, invite.expires_at);
            return (
              <div
                key={invite.id}
                className="flex items-center justify-between gap-4 card-soft px-4 py-3"
              >
                <div>
                  <p className="font-medium">{invite.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {label} · роль: {roleLabel(invite.role)} · действует до{" "}
                    {new Date(invite.expires_at).toLocaleDateString(LOCALE)}
                  </p>
                </div>
                {manage && invite.status === "pending" ? (
                  <RevokeInvitationButton invitationId={invite.id} />
                ) : null}
              </div>
            );
          })
        )}
      </section>

      {manage ? <InviteMemberForm /> : null}
    </div>
  );
}
