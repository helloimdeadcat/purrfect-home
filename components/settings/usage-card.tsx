import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { LOCALE } from "@/lib/locale";
import { formatMegabytes, getHouseholdUsage } from "@/services/usage-service";
import type { Database } from "@/types/database";

type Props = {
  supabase: SupabaseClient<Database>;
  ctx: HouseholdContext;
};

const count = new Intl.NumberFormat(LOCALE);

/**
 * Admin-only «Использование» block (async Server Component): how much of the
 * free-tier budget the household uses. Only head/count queries — no rows.
 */
export async function UsageCard({ supabase, ctx }: Props) {
  const usage = await getHouseholdUsage(supabase, ctx);
  const receipts = usage.receipts;
  const percent = receipts
    ? Math.min(100, Math.round((receipts.bytes / usage.receiptsBudgetBytes) * 100))
    : null;

  return (
    <section className="grid gap-3 card-soft p-4">
      <div>
        <h2 className="font-medium">Использование</h2>
        <p className="text-sm text-muted-foreground">
          Приложение живёт на бесплатных тарифах — тут видно, сколько места
          уже занято. Старые уведомления и записи истории удаляются сами.
        </p>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-border px-3 py-2">
          <dt className="text-muted-foreground">Чеки</dt>
          <dd className="font-medium tabular-nums">
            {receipts
              ? `${count.format(receipts.files)} шт. · ${formatMegabytes(receipts.bytes)} из ${formatMegabytes(
                  usage.receiptsBudgetBytes,
                )}`
              : "нет данных"}
          </dd>
          {percent !== null ? (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"
              role="meter"
              aria-label="Занято места под чеки"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div
                className={`h-full rounded-full ${percent >= 90 ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
        </div>
        <div className="rounded-lg border border-border px-3 py-2">
          <dt className="text-muted-foreground">Твои уведомления</dt>
          <dd className="font-medium tabular-nums">
            {usage.notifications === null ? "нет данных" : count.format(usage.notifications)}
          </dd>
        </div>
        <div className="rounded-lg border border-border px-3 py-2">
          <dt className="text-muted-foreground">Записи в истории</dt>
          <dd className="font-medium tabular-nums">
            {usage.auditLogs === null ? "нет данных" : count.format(usage.auditLogs)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
