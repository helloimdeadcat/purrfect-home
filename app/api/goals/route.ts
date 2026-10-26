import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { createGoalSchema } from "@/lib/validations/goal";
import { createGoal, listGoals } from "@/services/goal-service";

export async function GET(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const includeArchived =
      new URL(request.url).searchParams.get("includeArchived") === "1";

    const { data, error } = await listGoals(auth.value.supabase, auth.value.ctx, {
      includeArchived,
    });
    if (error) return fromServiceError(error);

    return Response.json({
      currency: auth.value.ctx.currency,
      goals: data,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const body: unknown = await request.json();
    const input = createGoalSchema.parse(body);

    const { data, error } = await createGoal(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);

    return Response.json({ goal: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
