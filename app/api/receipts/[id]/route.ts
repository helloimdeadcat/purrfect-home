import { z } from "zod";

import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import {
  deleteReceipt,
  getReceiptDownloadUrl,
} from "@/services/receipt-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const idSchema = z.uuid();

/**
 * Redirects to a short-lived signed URL. The URL is never logged or cached,
 * and the bucket stays private.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const id = idSchema.parse((await context.params).id);
    const { data, error } = await getReceiptDownloadUrl(
      auth.value.supabase,
      auth.value.ctx,
      id,
    );
    if (error || !data) {
      return fromServiceError(error ?? { code: "NOT_FOUND", message: "Receipt not found" });
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: data,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const id = idSchema.parse((await context.params).id);
    const { error } = await deleteReceipt(auth.value.supabase, auth.value.ctx, id);
    if (error) return fromServiceError(error);

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
