import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { updateCategorySchema } from "@/lib/validations/settings";
import {
  archiveOrDeleteCategory,
  updateCategory,
} from "@/services/category-service";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body: unknown = await request.json();
    const input = updateCategorySchema.parse(body);
    const { data, error } = await updateCategory(
      auth.value.supabase,
      auth.value.ctx,
      id,
      input,
    );
    if (error) return fromServiceError(error);
    return Response.json({ category: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const { data, error } = await archiveOrDeleteCategory(
      auth.value.supabase,
      auth.value.ctx,
      id,
    );
    if (error) return fromServiceError(error);
    return Response.json({ ok: true, ...data });
  } catch (error) {
    return handleRouteError(error);
  }
}
