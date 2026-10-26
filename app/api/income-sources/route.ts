import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { createIncomeSourceSchema } from "@/lib/validations/settings";
import {
  createIncomeSource,
  listIncomeSources,
} from "@/services/income-source-service";

export async function GET(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const includeInactive =
      new URL(request.url).searchParams.get("includeInactive") === "1";
    const { data, error } = await listIncomeSources(
      auth.value.supabase,
      auth.value.ctx,
      { includeInactive },
    );
    if (error) return fromServiceError(error);
    return Response.json({ incomeSources: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const body: unknown = await request.json();
    const input = createIncomeSourceSchema.parse(body);
    const { data, error } = await createIncomeSource(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);
    return Response.json({ incomeSource: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
