import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { createCategorySchema } from "@/lib/validations/settings";
import {
  createCategory,
  listCategories,
} from "@/services/category-service";

export async function GET(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const includeInactive =
      new URL(request.url).searchParams.get("includeInactive") === "1";
    const { data, error } = await listCategories(
      auth.value.supabase,
      auth.value.ctx,
      { includeInactive },
    );
    if (error) return fromServiceError(error);
    return Response.json({ categories: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const body: unknown = await request.json();
    const input = createCategorySchema.parse(body);
    const { data, error } = await createCategory(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);
    return Response.json({ category: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
