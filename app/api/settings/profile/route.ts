import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { updateProfileSchema } from "@/lib/validations/settings";
import {
  getOwnProfile,
  updateOwnProfile,
} from "@/services/settings-service";

export async function GET() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { data, error } = await getOwnProfile(
      auth.value.supabase,
      auth.value.ctx,
    );
    if (error) return fromServiceError(error);
    return Response.json({
      profile: data,
      displayName: auth.value.ctx.displayName,
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
    const input = updateProfileSchema.parse(body);
    const { data, error } = await updateOwnProfile(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);
    return Response.json({ profile: data });
  } catch (error) {
    return handleRouteError(error);
  }
}
