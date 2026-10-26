import { z } from "zod";

import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { setTaskCompletionSchema } from "@/lib/validations/task";
import { setTaskCompletion } from "@/services/task-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** POST { date?: "YYYY-MM-DD", done: boolean } — tick an occurrence off or undo it. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const id = z.uuid().parse((await context.params).id);
    const input = setTaskCompletionSchema.parse(await request.json());
    const { error } = await setTaskCompletion(auth.value.supabase, auth.value.ctx, id, input);
    if (error) return fromServiceError(error);

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
