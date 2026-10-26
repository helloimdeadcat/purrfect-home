import Link from "next/link";

import { ForecastBalanceChart } from "@/components/forecast/forecast-balance-chart";
import { ForecastHorizonFilters } from "@/components/forecast/forecast-horizon-filters";
import { displayMoney } from "@/lib/calculations/money";
import type { ForecastReport } from "@/services/forecast-service";

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
            <h2 className="font-medium">Forecast &amp; Safe-to-Spend</h2>
            <span className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
              Estimate
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {report.today} → {report.range.end} · {report.timezone}
            {!report.reserveConfigured
              ? " · reserve not configured (0.00)"
              : ""}
          </p>
        </div>
        {compact ? (
          <Link
            href={`/app/analytics?horizon=${report.horizon}&currency=${selectedCurrency}`}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Full forecast
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
          No balances available for this currency.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="Current balance"
              value={displayMoney(primary.currentBalance, primary.currency)}
              hint="Actual"
            />
            <Metric
              label="Forecast balance"
              value={displayMoney(primary.forecastBalance, primary.currency)}
              hint="Forecast"
            />
            <Metric
              label="Safe-to-Spend"
              value={displayMoney(primary.safeToSpend, primary.currency)}
              hint="Estimate"
              tone={primary.isDeficit ? "danger" : "default"}
            />
          </div>

          {primary.isDeficit ? (
            <p className="text-sm text-destructive" role="status">
              Deficit of{" "}
              {displayMoney(primary.deficitAmount, primary.currency)} — planned
              outflows exceed current balance for this horizon. Value is not
              masked to zero.
            </p>
          ) : null}

          <details className="rounded-lg border border-border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">
              Why this Safe-to-Spend?
            </summary>
            <div className="mt-2 grid gap-1 text-muted-foreground">
              <p>
                Starting balance:{" "}
                <span className="tabular-nums text-foreground">
                  {displayMoney(primary.currentBalance, primary.currency)}
                </span>
              </p>
              <p>
                − Mandatory outflows:{" "}
                <span className="tabular-nums text-foreground">
                  {displayMoney(primary.mandatoryOutflows, primary.currency)}
                </span>
              </p>
              <p>
                − Reserve:{" "}
                <span className="tabular-nums text-foreground">
                  {displayMoney(primary.reserve, primary.currency)}
                </span>{" "}
                (not configured)
              </p>
              <p>
                = Safe-to-Spend:{" "}
                <span className="tabular-nums text-foreground">
                  {displayMoney(primary.safeToSpend, primary.currency)}
                </span>
              </p>
              <p className="pt-1">{report.formulas.safeToSpend}</p>
              <p>{report.formulas.forecastBalance}</p>
              <p>
                Expected income ({displayMoney(primary.expectedIncome, primary.currency)})
                lifts forecast balance only — never Safe-to-Spend.
              </p>
            </div>
          </details>

          {!compact ? (
            <div className="grid gap-3">
              <h3 className="text-sm font-medium">
                Forecast balance path ({primary.currency})
              </h3>
              <ForecastBalanceChart
                series={report.cashFlowByCurrency[primary.currency] ?? []}
                currency={primary.currency}
              />
            </div>
          ) : null}

          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Upcoming obligations</h3>
            {obligations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No eligible recurring expenses in this horizon.
              </p>
            ) : (
              <ul className="grid gap-1">
                {obligations.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {event.date} · {event.name}
                      <span className="text-muted-foreground">
                        {" "}
                        ({event.source}/{event.status})
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
                Budgets near limit ({report.budgetHeadroom.month})
              </h3>
              <p className="text-xs text-muted-foreground">
                Informational only — not deducted from Safe-to-Spend.
              </p>
              <ul className="grid gap-1">
                {nearBudgets.map((row) => (
                  <li
                    key={row.budgetId}
                    className="flex justify-between gap-3 text-sm"
                  >
                    <span>
                      {row.categoryName ?? "Category"} · {row.status}
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
                Excluded events ({report.excludedEvents.length})
              </summary>
              <ul className="mt-2 grid gap-1">
                {report.excludedEvents.slice(0, 30).map((event) => (
                  <li key={event.id} className="text-muted-foreground">
                    {event.date} · {event.name}: {event.reason}
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
