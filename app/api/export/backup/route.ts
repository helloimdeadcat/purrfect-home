import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { exportHouseholdBackup } from "@/services/backup-service";

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "household";
}

export async function GET() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { data, error } = await exportHouseholdBackup(
      auth.value.supabase,
      auth.value.ctx,
    );
    if (error || !data) {
      return fromServiceError(
        error ?? { code: "DB", message: "Не получилось сделать резервную копию" },
      );
    }

    const day = data.exportedAt.slice(0, 10);
    const name = safeFilePart(data.householdName);
    const filename = `purrfect-home-backup-${name}-${day}.json`;

    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
