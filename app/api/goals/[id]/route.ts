import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { updateGoalSchema } from "@/lib/validations/goal";
import { deleteGoal, getGoal, updateGoal } from "@/services/goal-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const { data, error } = await getGoal(
      auth.value.supabase,
      auth.value.ctx,
      id,
    );
    if (error) return fromServiceError(error);

    return Response.json({ goal: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body: unknown = await request.json();
    const input = updateGoalSchema.parse(body);

    const { data, error } = await updateGoal(
      auth.value.supabase,
      auth.value.ctx,
      id,
      input,
    );
    if (error) return fromServiceError(error);

    return Response.json({ goal: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const { error } = await deleteGoal(
      auth.value.supabase,
      auth.value.ctx,
      id,
    );
    if (error) return fromServiceError(error);

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
