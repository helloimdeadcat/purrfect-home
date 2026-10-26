import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { revokeInvitation } from "@/services/invitation-service";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const { error } = await revokeInvitation(
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
