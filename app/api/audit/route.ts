import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { auditLogQuerySchema } from "@/lib/validations/notification";
import { listAuditLog } from "@/services/audit-service";

export async function GET(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const input = auditLogQuerySchema.parse({
      before: url.searchParams.get("before") ?? undefined,
    });
    const { data, error } = await listAuditLog(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);

    return Response.json({ entries: data });
  } catch (error) {
    return handleRouteError(error);
  }
}
