import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { createBudgetSchema } from "@/lib/validations/budget";
import {
  createMonthlyCategoryBudget,
  listBudgetsForMonth,
} from "@/services/budget-service";

export async function GET(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const month = new URL(request.url).searchParams.get("month") ?? undefined;
    const { data, error } = await listBudgetsForMonth(
      auth.value.supabase,
      auth.value.ctx,
      month,
    );
    if (error) return fromServiceError(error);

    return Response.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const body: unknown = await request.json();
    const input = createBudgetSchema.parse(body);

    const { data, error } = await createMonthlyCategoryBudget(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);

    return Response.json({ budget: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
