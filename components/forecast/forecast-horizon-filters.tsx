import Link from "next/link";

import type { ForecastHorizonPreset } from "@/lib/calculations/forecast-horizon";
import { cn } from "@/lib/utils";

const HORIZONS: { value: ForecastHorizonPreset; label: string }[] = [
  { value: "end_of_month", label: "До конца месяца" },
  { value: "next_7_days", label: "7 дней" },
  { value: "next_30_days", label: "30 дней" },
];

type Props = {
  horizon: ForecastHorizonPreset;
  currency: string;
  currencies: string[];
  /** Base path for filter links, e.g. /app/dashboard or /app/analytics */
  basePath: string;
  /** Extra query params to preserve (period, etc.) */
  preserve?: Record<string, string | undefined>;
};

function hrefFor(
  basePath: string,
  preserve: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...preserve, ...patch })) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function ForecastHorizonFilters({
  horizon,
  currency,
  currencies,
  basePath,
  preserve = {},
}: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Период прогноза">
        {HORIZONS.map((item) => (
          <Link
            key={item.value}
            href={hrefFor(basePath, preserve, {
              horizon: item.value,
              currency,
            })}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm",
              horizon === item.value
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground/40",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
      {currencies.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Валюта">
          {currencies.map((code) => (
            <Link
              key={code}
              href={hrefFor(basePath, preserve, {
                horizon,
                currency: code,
              })}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm tabular-nums",
                currency === code
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/40",
              )}
            >
              {code}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
