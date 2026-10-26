import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { updateHouseholdSettingsSchema } from "@/lib/validations/settings";
import {
  getHouseholdSettings,
  updateHouseholdSettings,
} from "@/services/settings-service";

export async function GET() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { data, error } = await getHouseholdSettings(
      auth.value.supabase,
      auth.value.ctx,
    );
    if (error) return fromServiceError(error);
    return Response.json({
      settings: data,
      householdName: auth.value.ctx.householdName,
      baseCurrency: auth.value.ctx.currency,
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
    const input = updateHouseholdSettingsSchema.parse(body);
    const { data, error } = await updateHouseholdSettings(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);
    return Response.json({ settings: data });
  } catch (error) {
    return handleRouteError(error);
  }
}
