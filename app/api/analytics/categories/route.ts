import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { analyticsQuerySchema } from "@/lib/validations/analytics";
import { getCategoryAnalytics } from "@/services/analytics-service";

export async function GET(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const input = analyticsQuerySchema.parse({
      period: url.searchParams.get("period") ?? undefined,
      currency: url.searchParams.get("currency") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      accountId: url.searchParams.get("accountId") ?? undefined,
    });

    const { data, error } = await getCategoryAnalytics(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);
    return Response.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
