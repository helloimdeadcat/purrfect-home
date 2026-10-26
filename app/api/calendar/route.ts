import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { dateFromIsoDay, parseYearMonth } from "@/lib/calculations/budget-month";
import { getCalendarMonth } from "@/services/calendar-service";
import { getHouseholdToday } from "@/services/settings-service";

export async function GET(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const { today } = await getHouseholdToday(auth.value.supabase, auth.value.ctx);
    const { year, month } = parseYearMonth(
      url.searchParams.get("month"),
      dateFromIsoDay(today),
    );

    const { data, error } = await getCalendarMonth(
      auth.value.supabase,
      auth.value.ctx,
      year,
      month,
    );
    if (error) return fromServiceError(error);

    return Response.json({ calendar: data });
  } catch (error) {
    return handleRouteError(error);
  }
}
