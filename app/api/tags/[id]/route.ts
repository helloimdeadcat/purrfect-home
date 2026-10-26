import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { updateTagSchema } from "@/lib/validations/settings";
import { archiveOrDeleteTag, updateTag } from "@/services/tag-service";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body: unknown = await request.json();
    const input = updateTagSchema.parse(body);
    const { data, error } = await updateTag(
      auth.value.supabase,
      auth.value.ctx,
      id,
      input,
    );
    if (error) return fromServiceError(error);
    return Response.json({ tag: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const { data, error } = await archiveOrDeleteTag(
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
