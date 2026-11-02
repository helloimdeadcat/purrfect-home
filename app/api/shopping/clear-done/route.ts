import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { clearDoneShoppingItems } from "@/services/shopping-service";

export async function POST() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { deleted, error } = await clearDoneShoppingItems(
      auth.value.supabase,
      auth.value.ctx,
    );
    if (error) return fromServiceError(error);
    return Response.json({ deleted });
  } catch (error) {
    return handleRouteError(error);
  }
}
