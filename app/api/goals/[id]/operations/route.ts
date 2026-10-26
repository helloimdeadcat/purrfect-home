import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { goalOperationSchema } from "@/lib/validations/goal";
import {
  applyGoalOperation,
  listGoalOperations,
} from "@/services/goal-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const { data, error } = await listGoalOperations(
      auth.value.supabase,
      auth.value.ctx,
      id,
    );
    if (error) return fromServiceError(error);

    return Response.json({ operations: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body: unknown = await request.json();
    const input = goalOperationSchema.parse(body);

    const { data, error } = await applyGoalOperation(
      auth.value.supabase,
      auth.value.ctx,
      id,
      input,
    );
    if (error) return fromServiceError(error);

    return Response.json(
      { goal: data!.goal, operationId: data!.operationId },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
