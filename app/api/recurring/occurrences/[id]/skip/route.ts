import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { skipOccurrenceSchema } from "@/lib/validations/recurring";
import { skipOccurrence } from "@/services/recurring-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body: unknown = await request.json().catch(() => ({}));
    const input = skipOccurrenceSchema.parse(body ?? {});

    const { data, error } = await skipOccurrence(
      auth.value.supabase,
      auth.value.ctx,
      id,
      input,
    );
    if (error) return fromServiceError(error);

    return Response.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
