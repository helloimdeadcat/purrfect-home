import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { csvFileName, csvResponse } from "@/lib/export/csv";
import { analyticsQuerySchema } from "@/lib/validations/analytics";
import { exportAnalyticsCsv } from "@/services/export-service";

export async function GET(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const params = new URL(request.url).searchParams;
    const input = analyticsQuerySchema.parse({
      period: params.get("period") ?? undefined,
      currency: params.get("currency") || undefined,
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
      accountId: params.get("accountId") || undefined,
    });

    const { data, error } = await exportAnalyticsCsv(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error || !data) {
      return fromServiceError(error ?? { code: "DB", message: "Export failed" });
    }

    return csvResponse(
      data.csv,
      csvFileName(["analytics", data.start, data.end, data.currency]),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
