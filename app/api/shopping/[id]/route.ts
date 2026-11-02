import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { updateShoppingItemSchema } from "@/lib/validations/shopping";
import {
  deleteShoppingItem,
  updateShoppingItem,
} from "@/services/shopping-service";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;
    const { id } = await params;

    const body = updateShoppingItemSchema.parse(await request.json());
    const { data, error } = await updateShoppingItem(
      auth.value.supabase,
      auth.value.ctx,
      id,
      body,
    );
    if (error || !data) {
      return fromServiceError(
        error ?? { code: "DB", message: "Не получилось обновить" },
      );
    }
    return Response.json({ item: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;
    const { id } = await params;

    const { error } = await deleteShoppingItem(
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
