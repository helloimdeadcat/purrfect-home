import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { createShoppingItemSchema } from "@/lib/validations/shopping";
import {
  createShoppingItem,
  listShoppingItems,
} from "@/services/shopping-service";

export async function GET() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { data, error } = await listShoppingItems(
      auth.value.supabase,
      auth.value.ctx,
    );
    if (error) return fromServiceError(error);
    return Response.json({ items: data ?? [] });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const body = createShoppingItemSchema.parse(await request.json());
    const { data, error } = await createShoppingItem(
      auth.value.supabase,
      auth.value.ctx,
      body,
    );
    if (error || !data) {
      return fromServiceError(
        error ?? { code: "DB", message: "Не получилось добавить" },
      );
    }
    return Response.json({ items: data, item: data[0] ?? null }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
