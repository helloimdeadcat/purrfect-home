import { setPreferredHouseholdId } from "@/lib/auth/active-household";
import { fromServiceError, handleRouteError } from "@/lib/auth/api";
import { fromZodError, jsonError } from "@/lib/auth/errors";
import { getSessionUser } from "@/lib/auth/session";
import { schedulePushDispatch } from "@/lib/push/dispatch";
import { acceptInvitationSchema } from "@/lib/validations/family";
import { acceptInvitation } from "@/services/invitation-service";
import { ZodError } from "zod";

/**
 * Explicitly accept a household invitation. Requires an authenticated session.
 * household_id / role are never taken from the client — only the opaque token.
 *
 * Does not use requireHousehold() (the user may not be a member yet), so we
 * explicitly flush push for the household the invite joins — member_joined
 * notifications are inserted by a DB trigger during accept.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await getSessionUser();
    if (!user) {
      return jsonError(401, "Нужно войти в аккаунт");
    }

    const body: unknown = await request.json();
    const { token } = acceptInvitationSchema.parse(body);

    const { data, error } = await acceptInvitation(supabase, token, user);
    if (error) return fromServiceError(error);

    await setPreferredHouseholdId(data!.householdId);
    await schedulePushDispatch(data!.householdId);

    return Response.json({
      ok: true,
      householdId: data!.householdId,
      memberId: data!.memberId,
      alreadyMember: data!.alreadyMember,
      redirectTo: "/app/dashboard",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fromZodError(error);
    }
    return handleRouteError(error);
  }
}
