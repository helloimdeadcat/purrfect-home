import { z } from "zod";

import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { updateTaskSchema } from "@/lib/validations/task";
import { deleteTask, updateTask } from "@/services/task-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const idSchema = z.uuid();

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const id = idSchema.parse((await context.params).id);
    const input = updateTaskSchema.parse(await request.json());
    const { data, error } = await updateTask(auth.value.supabase, auth.value.ctx, id, input);
    if (error) return fromServiceError(error);

    return Response.json({ task: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const id = idSchema.parse((await context.params).id);
    const { error } = await deleteTask(auth.value.supabase, auth.value.ctx, id);
    if (error) return fromServiceError(error);

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
