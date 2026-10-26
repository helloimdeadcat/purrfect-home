import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { canAdmin } from "@/lib/auth/household";
import { updateHouseholdSchema } from "@/lib/validations/family";
import {
  listFamilyMembers,
  updateHouseholdName,
} from "@/services/family-service";
import { listInvitations } from "@/services/invitation-service";

export async function GET() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { supabase, ctx } = auth.value;

    const [membersResult, invitationsResult] = await Promise.all([
      listFamilyMembers(supabase, ctx),
      listInvitations(supabase, ctx),
    ]);

    if (membersResult.error) return fromServiceError(membersResult.error);
    if (invitationsResult.error) return fromServiceError(invitationsResult.error);

    return Response.json({
      household: {
        id: ctx.householdId,
        name: ctx.householdName,
        currency: ctx.currency,
      },
      role: ctx.role,
      canManage: canAdmin(ctx.role),
      members: membersResult.data,
      invitations: invitationsResult.data,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const body: unknown = await request.json();
    const input = updateHouseholdSchema.parse(body);

    const { data, error } = await updateHouseholdName(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);

    return Response.json({ household: data });
  } catch (error) {
    return handleRouteError(error);
  }
}
