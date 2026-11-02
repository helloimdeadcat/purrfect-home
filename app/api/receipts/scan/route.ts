import { AiError } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import { takeAiQuota } from "@/lib/ai/rate-limit";
import { handleRouteError, requireHousehold } from "@/lib/auth/api";
import { jsonError } from "@/lib/auth/errors";
import { listHouseholdCategories } from "@/lib/data/categories";
import { MAX_RECEIPT_BYTES, validateReceiptBytes } from "@/lib/validations/receipt";
import { SCAN_MIME_TYPES, scanReceipt, type ScanMimeType } from "@/services/receipt-scan-service";
import { getHouseholdToday } from "@/services/settings-service";

/** One AI call: up to ~70 s when the main model times out and the fallback answers. */
export const maxDuration = 90;

/** Multipart framing on top of the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * POST multipart/form-data { file } → draft transaction fields read from a
 * receipt photo. The photo is only forwarded to the AI provider, never stored.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;
    const { supabase, ctx } = auth.value;

    const config = getAiConfig();
    if (!config) {
      return jsonError(503, "Распознавание чеков пока не настроено: нужен AI_API_KEY в .env.local.");
    }

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_RECEIPT_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return jsonError(413, "Фото больше 8 МБ");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError(400, "Нужен multipart/form-data с полем file");
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError(400, "Фото не выбрано");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateReceiptBytes(bytes);
    if (!check.ok) return jsonError(400, check.message);
    if (!(SCAN_MIME_TYPES as readonly string[]).includes(check.kind.mimeType)) {
      return jsonError(400, "PDF распознать не получится — сфотографируй чек (JPEG, PNG, WebP или HEIC)");
    }

    // Quota is taken only for a request that will actually reach the AI.
    if (!(await takeAiQuota(supabase, ctx.user.id, "receipt_scan"))) {
      return jsonError(429, "Ого, сколько чеков! Сделай небольшой перерыв и попробуй снова через пару минут ♥");
    }

    const [categoriesResult, { today }] = await Promise.all([
      listHouseholdCategories(supabase, ctx.householdId),
      getHouseholdToday(supabase, ctx),
    ]);
    if (categoriesResult.error) {
      return jsonError(500, "Не удалось загрузить категории");
    }
    const categories = (categoriesResult.data ?? [])
      .filter((category) => category.type === "expense" || category.type === "both")
      .map((category) => ({ id: category.id, name: category.name }));

    const result = await scanReceipt(config, {
      bytes,
      mimeType: check.kind.mimeType as ScanMimeType,
      categories,
      today,
      currency: ctx.currency,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof AiError) {
      return jsonError(error.kind === "rate_limited" ? 429 : 502, error.message);
    }
    return handleRouteError(error);
  }
}
