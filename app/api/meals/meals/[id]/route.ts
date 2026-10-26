import { z } from "zod";

import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { updateMealSchema } from "@/lib/validations/meal";
import { deleteMeal, updateMeal } from "@/services/meal-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const id = z.uuid().parse((await context.params).id);
    const input = updateMealSchema.parse(await request.json());
    const { error } = await updateMeal(auth.value.supabase, auth.value.ctx, id, input);
    if (error) return fromServiceError(error);

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const id = z.uuid().parse((await context.params).id);
    const { error } = await deleteMeal(auth.value.supabase, auth.value.ctx, id);
    if (error) return fromServiceError(error);

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
