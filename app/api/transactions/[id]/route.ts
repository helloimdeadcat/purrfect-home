import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { jsonError } from "@/lib/auth/errors";
import { updateTransactionSchema } from "@/lib/validations/transaction";
import {
  softDeleteTransaction,
  updateTransaction,
} from "@/services/transaction-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    if (!id) return jsonError(400, "Нужен id операции");

    const body: unknown = await request.json();
    const input = updateTransactionSchema.parse(body);

    const { data, error } = await updateTransaction(
      auth.value.supabase,
      auth.value.ctx,
      id,
      input,
    );
    if (error) return fromServiceError(error);

    return Response.json({ transaction: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    if (!id) return jsonError(400, "Нужен id операции");

    const { error } = await softDeleteTransaction(
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
