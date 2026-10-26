import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { forecastQuerySchema } from "@/lib/validations/forecast";
import { getForecastReport } from "@/services/forecast-service";

function parseQuery(url: URL) {
  return forecastQuerySchema.parse({
    horizon: url.searchParams.get("horizon") ?? undefined,
    currency: url.searchParams.get("currency") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
}

export async function GET(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const input = parseQuery(new URL(request.url));
    const { data, error } = await getForecastReport(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);
    return Response.json({ forecast: data });
  } catch (error) {
    return handleRouteError(error);
  }
}
