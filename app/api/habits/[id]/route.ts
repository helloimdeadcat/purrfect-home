import { z } from "zod";

import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { updateHabitSchema } from "@/lib/validations/habit";
import { deleteHabit, updateHabit } from "@/services/habit-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const id = z.uuid().parse((await context.params).id);
    const input = updateHabitSchema.parse(await request.json());
    const { data, error } = await updateHabit(auth.value.supabase, auth.value.ctx, id, input);
    if (error) return fromServiceError(error);

    return Response.json({ habit: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const id = z.uuid().parse((await context.params).id);
    const { error } = await deleteHabit(auth.value.supabase, auth.value.ctx, id);
    if (error) return fromServiceError(error);

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
