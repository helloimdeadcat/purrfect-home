import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { createTransactionSchema } from "@/lib/validations/transaction";
import {
  createTransaction,
  listTransactions,
} from "@/services/transaction-service";

export async function GET() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { data, error } = await listTransactions(
      auth.value.supabase,
      auth.value.ctx,
    );
    if (error) return fromServiceError(error);

    return Response.json({ transactions: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const body: unknown = await request.json();
    const input = createTransactionSchema.parse(body);

    const { data, error } = await createTransaction(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);

    return Response.json({ transaction: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
