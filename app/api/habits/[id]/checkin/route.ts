import { z } from "zod";

import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { habitCheckinSchema } from "@/lib/validations/habit";
import { setHabitCheckin } from "@/services/habit-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** POST { date, value } — your own check-in; value 0/null clears the day. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const id = z.uuid().parse((await context.params).id);
    const input = habitCheckinSchema.parse(await request.json());
    const { error } = await setHabitCheckin(auth.value.supabase, auth.value.ctx, id, input);
    if (error) return fromServiceError(error);

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
