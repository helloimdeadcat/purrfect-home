import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { analyticsQuerySchema } from "@/lib/validations/analytics";
import { getAnalyticsReport } from "@/services/analytics-service";

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

    const { data, error } = await getAnalyticsReport(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);
    return Response.json({
      currency: data?.currency,
      budgets: data?.budgets,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
