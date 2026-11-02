import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { csvFileName, csvResponse } from "@/lib/export/csv";
import { transactionExportSchema } from "@/lib/validations/export";
import { exportTransactionsCsv } from "@/services/export-service";

export async function GET(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const params = new URL(request.url).searchParams;
    const input = transactionExportSchema.parse({
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      currency: params.get("currency") || undefined,
      accountId: params.get("accountId") || undefined,
    });

    const { data, error } = await exportTransactionsCsv(
      auth.value.supabase,
      auth.value.ctx,
      input,
    );
    if (error || data === null) {
      return fromServiceError(error ?? { code: "DB", message: "Не получилось выгрузить" });
    }

    return csvResponse(
      data,
      csvFileName(["transactions", input.from, input.to, input.currency ?? "all"]),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
