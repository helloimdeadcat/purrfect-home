import { redirect } from "next/navigation";

import { InviteMemberForm } from "@/components/family/invite-member-form";
import { RenameHouseholdForm } from "@/components/family/rename-household-form";
import { RevokeInvitationButton } from "@/components/family/revoke-invitation-button";
import { canAdmin, getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { listFamilyMembers } from "@/services/family-service";
import { listInvitations } from "@/services/invitation-service";

function statusLabel(status: string, expiresAt: string): string {
  if (status === "pending" && new Date(expiresAt) <= new Date()) {
    return "expired";
  }
  return status;
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
        <h1 className="text-2xl font-semibold tracking-tight">Family</h1>
        <p className="text-sm text-destructive" role="alert">
          {ctxError ?? "No household access"}
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
        <h1 className="text-2xl font-semibold tracking-tight">Family</h1>
        <p className="text-muted-foreground">
          Manage your household members and invitations.
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
          Your role: {ctx.role} · Base currency: {ctx.currency}
        </p>
      </section>

      {manage ? <RenameHouseholdForm currentName={ctx.householdName} /> : null}

      <section className="grid gap-3">
        <h2 className="font-medium">Members</h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members found.</p>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between gap-4 card-soft px-4 py-3"
            >
              <div>
                <p className="font-medium">
                  {member.display_name ?? member.email ?? "Member"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {member.email ?? "No email"} · {member.role}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          ))
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium">Invitations</h2>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No invitations yet.
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
                  <p className="text-sm text-muted-foreground capitalize">
                    {label} · role {invite.role} · expires{" "}
                    {new Date(invite.expires_at).toLocaleDateString()}
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
