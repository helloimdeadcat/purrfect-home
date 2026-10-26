import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { createTransferSchema } from "@/lib/validations/transfer";
import { createTransfer, listTransfers } from "@/services/transfer-service";

export async function GET() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { data, error } = await listTransfers(
      auth.value.supabase,
      auth.value.ctx,
    );
    if (error) return fromServiceError(error);

    return Response.json({ transfers: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const body: unknown = await request.json();
    const input = createTransferSchema.parse(body);

    const { data, error } = await createTransfer(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);

    return Response.json({ transfer: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
