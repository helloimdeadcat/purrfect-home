import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { jsonError } from "@/lib/auth/errors";
import { updateAccountSchema } from "@/lib/validations/account";
import { deactivateAccount, updateAccount } from "@/services/account-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    if (!id) return jsonError(400, "Account id is required");

    const body: unknown = await request.json();
    const input = updateAccountSchema.parse(body);

    const { data, error } = await updateAccount(
      auth.value.supabase,
      auth.value.ctx,
      id,
      input,
    );
    if (error) return fromServiceError(error);

    return Response.json({ account: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    if (!id) return jsonError(400, "Account id is required");

    const { error } = await deactivateAccount(
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
