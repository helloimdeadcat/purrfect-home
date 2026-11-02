import Link from "next/link";

import { ForecastBalanceChart } from "@/components/forecast/forecast-balance-chart";
import { ForecastHorizonFilters } from "@/components/forecast/forecast-horizon-filters";
import { displayMoney } from "@/lib/calculations/money";
import { LOCALE } from "@/lib/locale";
import type { ForecastReport } from "@/services/forecast-service";

const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : dayFormat.format(date);
}

const SOURCE_LABELS: Record<string, string> = {
  occurrence: "платёж",
  projected: "по графику",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "ждёт",
  overdue: "просрочено",
  paid: "оплачено",
  skipped: "пропущено",
  scheduled: "запланировано",
  empty: "пусто",
  under: "в пределах",
  warning: "почти лимит",
  reached: "лимит достигнут",
  over: "перерасход",
};

function monthTitle(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  return new Intl.DateTimeFormat(LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

type Props = {
  report: ForecastReport;
  basePath: string;
  preserve?: Record<string, string | undefined>;
  /** Compact mode for dashboard */
  compact?: boolean;
};

export function ForecastPanel({
  report,
  basePath,
  preserve,
  compact = false,
}: Props) {
  const currencyOptions = [
    ...new Set([
      ...report.currencies.map((c) => c.currency),
      ...(report.focusCurrency ? [report.focusCurrency] : []),
    ]),
  ].sort();

  const primary =
    report.currencies.find((c) => c.currency === report.focusCurrency) ??
    report.currencies[0] ??
    null;

  const selectedCurrency = primary?.currency ?? report.focusCurrency ?? "EUR";
  const nearBudgets = report.budgetHeadroom.rows.filter((r) => r.nearLimit);
  const obligations = report.includedObligations
    .filter((e) => e.currency === selectedCurrency)
    .slice(0, compact ? 5 : 20);

  return (
    <section className="grid gap-4 card-soft p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-medium">Прогноз и «Можно потратить» 🔮</h2>
            <span className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
              Оценка
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDay(report.today)} → {formatDay(report.range.end)} · {report.timezone}
            {!report.reserveConfigured
              ? " · резерв не задан (0,00)"
              : ""}
          </p>
        </div>
        {compact ? (
          <Link
            href={`/app/analytics?horizon=${report.horizon}&currency=${selectedCurrency}`}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Весь прогноз
          </Link>
        ) : null}
      </div>

      <ForecastHorizonFilters
        horizon={report.horizon}
        currency={selectedCurrency}
        currencies={
          currencyOptions.length > 0 ? currencyOptions : [selectedCurrency]
        }
        basePath={basePath}
        preserve={preserve}
      />

      {!primary ? (
        <p className="text-sm text-muted-foreground">
          Для этой валюты пока нет балансов.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="Текущий баланс"
              value={displayMoney(primary.currentBalance, primary.currency)}
              hint="Факт"
            />
            <Metric
              label="Прогноз баланса"
              value={displayMoney(primary.forecastBalance, primary.currency)}
              hint="Прогноз"
            />
            <Metric
              label="Можно потратить"
              value={displayMoney(primary.safeToSpend, primary.currency)}
              hint="Оценка"
              tone={primary.isDeficit ? "danger" : "default"}
            />
          </div>

          {primary.isDeficit ? (
            <p className="text-sm text-destructive" role="status">
              Не хватает{" "}
              {displayMoney(primary.deficitAmount, primary.currency)} — запланированные
              расходы за этот период больше текущего баланса. Мы честно
              показываем минус, а не ноль.
            </p>
          ) : null}

          <details className="rounded-lg border border-border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">
              Откуда такая сумма «Можно потратить»?
            </summary>
            <div className="mt-2 grid gap-1 text-muted-foreground">
              <p>
                Баланс сейчас:{" "}
                <span className="tabular-nums text-foreground">
                  {displayMoney(primary.currentBalance, primary.currency)}
                </span>
              </p>
              <p>
                − Обязательные платежи:{" "}
                <span className="tabular-nums text-foreground">
                  {displayMoney(primary.mandatoryOutflows, primary.currency)}
                </span>
              </p>
              <p>
                − Резерв:{" "}
                <span className="tabular-nums text-foreground">
                  {displayMoney(primary.reserve, primary.currency)}
                </span>
                {!report.reserveConfigured ? " (не задан)" : ""}
              </p>
              <p>
                = Можно потратить:{" "}
                <span className="tabular-nums text-foreground">
                  {displayMoney(primary.safeToSpend, primary.currency)}
                </span>
              </p>
              <p className="pt-1">{report.formulas.safeToSpend}</p>
              <p>{report.formulas.forecastBalance}</p>
              <p>
                Ожидаемый доход ({displayMoney(primary.expectedIncome, primary.currency)})
                повышает только прогноз баланса, но не «Можно потратить».
              </p>
            </div>
          </details>

          {!compact ? (
            <div className="grid gap-3">
              <h3 className="text-sm font-medium">
                Как будет меняться баланс ({primary.currency})
              </h3>
              <ForecastBalanceChart
                series={report.cashFlowByCurrency[primary.currency] ?? []}
                currency={primary.currency}
              />
            </div>
          ) : null}

          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Скоро к оплате</h3>
            {obligations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                В этом периоде нет регулярных расходов 😺
              </p>
            ) : (
              <ul className="grid gap-1">
                {obligations.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {formatDay(event.date)} · {event.name}
                      <span className="text-muted-foreground">
                        {" "}
                        ({SOURCE_LABELS[event.source] ?? event.source}, {STATUS_LABELS[event.status] ?? event.status})
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      −{displayMoney(event.amount, event.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {nearBudgets.length > 0 ? (
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">
                Бюджеты на грани ({monthTitle(report.budgetHeadroom.month)})
              </h3>
              <p className="text-xs text-muted-foreground">
                Только для справки — из «Можно потратить» не вычитается.
              </p>
              <ul className="grid gap-1">
                {nearBudgets.map((row) => (
                  <li
                    key={row.budgetId}
                    className="flex justify-between gap-3 text-sm"
                  >
                    <span>
                      {row.categoryName ?? "Категория"} · {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                    <span className="tabular-nums">
                      {displayMoney(row.spent, row.currency)} /{" "}
                      {displayMoney(row.limit, row.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!compact && report.excludedEvents.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Не учтено в прогнозе ({report.excludedEvents.length})
              </summary>
              <ul className="mt-2 grid gap-1">
                {report.excludedEvents.slice(0, 30).map((event) => (
                  <li key={event.id} className="text-muted-foreground">
                    {formatDay(event.date)} · {event.name}: {event.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <ul className="grid gap-1 text-xs text-muted-foreground">
            {report.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {hint}
        </span>
      </div>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === "danger" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
