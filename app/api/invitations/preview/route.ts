import { handleRouteError } from "@/lib/auth/api";
import { fromZodError, jsonError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";
import { acceptInvitationSchema } from "@/lib/validations/family";
import { previewInvitation } from "@/services/invitation-service";
import { ZodError } from "zod";

/**
 * Preview an invitation by token. Does not consume the invite.
 * Available without auth so invitees can see household name before signing in.
 * Token is never logged.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const { token } = acceptInvitationSchema.parse(body);

    const supabase = await createClient();
    const { data, error } = await previewInvitation(supabase, token);
    if (error) {
      return jsonError(400, "Invalid invitation", { code: error.code });
    }

    return Response.json({ preview: data });
  } catch (error) {
    if (error instanceof ZodError) {
      return fromZodError(error);
    }
    return handleRouteError(error);
  }
}
