import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { CATEGORY_LABEL } from "@/lib/meals/labels";
import { createShoppingTask } from "@/services/meal-service";

/** POST — add this week's shopping list to the shared to-dos. */
export async function POST() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { data, error } = await createShoppingTask(auth.value.supabase, auth.value.ctx, CATEGORY_LABEL);
    if (error) return fromServiceError(error);

    return Response.json({ task: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
