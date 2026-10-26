import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { createEmptyPlan } from "@/services/meal-service";

/** POST — start an empty plan (when not importing the 7-day plan). */
export async function POST() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { data, error } = await createEmptyPlan(auth.value.supabase, auth.value.ctx);
    if (error) return fromServiceError(error);

    return Response.json({ plan: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
