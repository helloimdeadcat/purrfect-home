import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { createMealSchema } from "@/lib/validations/meal";
import { createMeal } from "@/services/meal-service";

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const input = createMealSchema.parse(await request.json());
    const { data, error } = await createMeal(auth.value.supabase, auth.value.ctx, input);
    if (error) return fromServiceError(error);

    return Response.json({ meal: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
