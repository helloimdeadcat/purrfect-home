import { createAccountSchema } from "@/lib/validations/account";
import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { createAccount, listAccountsWithBalances } from "@/services/account-service";

export async function GET() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { data, error } = await listAccountsWithBalances(
      auth.value.supabase,
      auth.value.ctx,
    );
    if (error) return fromServiceError(error);

    return Response.json({ accounts: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const body: unknown = await request.json();
    const input = createAccountSchema.parse(body);

    const { data, error } = await createAccount(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);

    return Response.json({ account: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
