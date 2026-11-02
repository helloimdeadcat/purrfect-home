import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { importMealPlanShopping } from "@/services/shopping-service";

export async function POST() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { added, error } = await importMealPlanShopping(
      auth.value.supabase,
      auth.value.ctx,
    );
    if (error) return fromServiceError(error);
    return Response.json({ added });
  } catch (error) {
    return handleRouteError(error);
  }
}
