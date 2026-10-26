import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { getAppOrigin } from "@/lib/app-url";
import { createInvitationSchema } from "@/lib/validations/family";
import {
  createInvitation,
  listInvitations,
} from "@/services/invitation-service";

export async function GET() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { data, error } = await listInvitations(
      auth.value.supabase,
      auth.value.ctx,
    );
    if (error) return fromServiceError(error);

    return Response.json({ invitations: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const body: unknown = await request.json();
    const input = createInvitationSchema.parse(body);

    const origin = getAppOrigin(request);
    const { data, error } = await createInvitation(
      auth.value.supabase,
      auth.value.ctx,
      input,
      origin,
    );
    if (error) {
      console.error("[invite] createInvitation rejected", {
        code: error.code,
        message: error.message,
        householdId: auth.value.ctx.householdId,
        role: auth.value.ctx.role,
        // Never log invite tokens or full email beyond validation failures
      });
      return fromServiceError(error);
    }

    // inviteUrl (with raw token) is returned only to the authenticated owner/admin
    // who created it — used for secure dev delivery until email is configured.
    // Do not log inviteUrl or token.
    return Response.json(
      {
        invitation: {
          id: data!.invitation.id,
          email: data!.invitation.email,
          role: data!.invitation.role,
          status: data!.invitation.status,
          expires_at: data!.invitation.expires_at,
          created_at: data!.invitation.created_at,
        },
        inviteUrl: data!.inviteUrl,
        deliveryMode: data!.deliveryMode,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[invite] POST unexpected error", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return handleRouteError(error);
  }
}
