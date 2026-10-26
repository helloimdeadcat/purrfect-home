import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { foodSchema } from "@/lib/validations/meal";
import { createFood } from "@/services/meal-service";

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const input = foodSchema.parse(await request.json());
    const { data, error } = await createFood(auth.value.supabase, auth.value.ctx, input);
    if (error) return fromServiceError(error);

    return Response.json({ food: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
