import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { importPlanSchema } from "@/lib/validations/meal";
import { importSevenDayPlan } from "@/services/meal-service";

/** POST { husbandMemberId, wifeMemberId, createHabits } — load the 7-day plan. */
export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const input = importPlanSchema.parse(await request.json());
    const { data, error } = await importSevenDayPlan(auth.value.supabase, auth.value.ctx, input);
    if (error) return fromServiceError(error);

    return Response.json(data, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
