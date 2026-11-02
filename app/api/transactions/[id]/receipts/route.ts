import { z } from "zod";

import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { jsonError } from "@/lib/auth/errors";
import { MAX_RECEIPT_BYTES } from "@/lib/validations/receipt";
import {
  listReceiptsForTransactions,
  uploadReceipt,
} from "@/services/receipt-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const idSchema = z.uuid();
/** Multipart framing on top of the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export async function GET(_request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const id = idSchema.parse((await context.params).id);
    const { data, error } = await listReceiptsForTransactions(
      auth.value.supabase,
      auth.value.ctx,
      [id],
    );
    if (error) return fromServiceError(error);

    return Response.json({ receipts: data?.get(id) ?? [] });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const id = idSchema.parse((await context.params).id);

    // Reject obviously oversized bodies before buffering them.
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_RECEIPT_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return jsonError(413, "Файл больше 8 МБ");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError(400, "Нужен multipart/form-data с полем file");
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError(400, "Файл не выбран");
    }

    const { data, error } = await uploadReceipt(
      auth.value.supabase,
      auth.value.ctx,
      id,
      {
        bytes: new Uint8Array(await file.arrayBuffer()),
        fileName: file.name,
      },
    );
    if (error) return fromServiceError(error);

    return Response.json({ receipt: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
