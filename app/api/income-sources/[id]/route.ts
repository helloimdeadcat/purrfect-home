import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { updateIncomeSourceSchema } from "@/lib/validations/settings";
import {
  archiveIncomeSource,
  updateIncomeSource,
} from "@/services/income-source-service";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body: unknown = await request.json();
    const input = updateIncomeSourceSchema.parse(body);
    const { data, error } = await updateIncomeSource(
      auth.value.supabase,
      auth.value.ctx,
      id,
      input,
    );
    if (error) return fromServiceError(error);
    return Response.json({ incomeSource: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const { error } = await archiveIncomeSource(
      auth.value.supabase,
      auth.value.ctx,
      id,
    );
    if (error) return fromServiceError(error);
    return Response.json({ ok: true, archived: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
