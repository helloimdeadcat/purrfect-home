import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { updateRecurringSchema } from "@/lib/validations/recurring";
import {
  deleteRecurringPayment,
  listOccurrencesForPayment,
  updateRecurringPayment,
} from "@/services/recurring-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const { data, error } = await listOccurrencesForPayment(
      auth.value.supabase,
      auth.value.ctx,
      id,
    );
    if (error) return fromServiceError(error);

    return Response.json({ occurrences: data });
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
    const input = updateRecurringSchema.parse(body);

    const { data, error } = await updateRecurringPayment(
      auth.value.supabase,
      auth.value.ctx,
      id,
      input,
    );
    if (error) return fromServiceError(error);

    return Response.json({ payment: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const { error } = await deleteRecurringPayment(
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
