import { setPreferredHouseholdId } from "@/lib/auth/active-household";
import { fromServiceError, handleRouteError } from "@/lib/auth/api";
import { fromZodError, jsonError } from "@/lib/auth/errors";
import { getSessionUser } from "@/lib/auth/session";
import { acceptInvitationSchema } from "@/lib/validations/family";
import { acceptInvitation } from "@/services/invitation-service";
import { ZodError } from "zod";

/**
 * Explicitly accept a household invitation. Requires an authenticated session.
 * household_id / role are never taken from the client — only the opaque token.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await getSessionUser();
    if (!user) {
      return jsonError(401, "Unauthorized");
    }

    const body: unknown = await request.json();
    const { token } = acceptInvitationSchema.parse(body);

    const { data, error } = await acceptInvitation(supabase, token, user);
    if (error) return fromServiceError(error);

    await setPreferredHouseholdId(data!.householdId);

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
