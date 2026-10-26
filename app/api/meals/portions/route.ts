import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { setPortionsSchema } from "@/lib/validations/meal";
import { setPortions } from "@/services/meal-service";

/** PUT { mealId, foodId, grams: [{ memberId, grams }] } — 0 g removes a person's portion. */
export async function PUT(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const input = setPortionsSchema.parse(await request.json());
    const { error } = await setPortions(auth.value.supabase, auth.value.ctx, input);
    if (error) return fromServiceError(error);

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
