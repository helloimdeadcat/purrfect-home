import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { nutritionTargetSchema } from "@/lib/validations/meal";
import { upsertNutritionTarget } from "@/services/meal-service";

export async function PUT(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const input = nutritionTargetSchema.parse(await request.json());
    const { error } = await upsertNutritionTarget(auth.value.supabase, auth.value.ctx, input);
    if (error) return fromServiceError(error);

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
