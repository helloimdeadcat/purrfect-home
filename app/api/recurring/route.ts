import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { createRecurringSchema } from "@/lib/validations/recurring";
import {
  createRecurringPayment,
  listDueOccurrences,
  listRecurringPayments,
} from "@/services/recurring-service";

export async function GET(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const includeArchived = url.searchParams.get("includeArchived") === "1";

    const [paymentsResult, dueResult] = await Promise.all([
      listRecurringPayments(auth.value.supabase, auth.value.ctx, {
        includeArchived,
      }),
      listDueOccurrences(auth.value.supabase, auth.value.ctx),
    ]);

    if (paymentsResult.error) return fromServiceError(paymentsResult.error);
    if (dueResult.error) return fromServiceError(dueResult.error);

    return Response.json({
      payments: paymentsResult.data,
      due: dueResult.data,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const body: unknown = await request.json();
    const input = createRecurringSchema.parse(body);

    const { data, error } = await createRecurringPayment(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);

    return Response.json({ payment: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
