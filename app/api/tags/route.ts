import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { createTagSchema } from "@/lib/validations/settings";
import { createTag, listTags } from "@/services/tag-service";

export async function GET(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const includeInactive =
      new URL(request.url).searchParams.get("includeInactive") === "1";
    const { data, error } = await listTags(auth.value.supabase, auth.value.ctx, {
      includeInactive,
    });
    if (error) return fromServiceError(error);
    return Response.json({ tags: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const body: unknown = await request.json();
    const input = createTagSchema.parse(body);
    const { data, error } = await createTag(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error) return fromServiceError(error);
    return Response.json({ tag: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
