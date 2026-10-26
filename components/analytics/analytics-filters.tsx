import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnalyticsPeriodPreset } from "@/lib/calculations/analytics-period";

const PERIODS: { value: AnalyticsPeriodPreset; label: string }[] = [
  { value: "current_month", label: "This month" },
  { value: "previous_month", label: "Last month" },
  { value: "last_3_months", label: "3 months" },
  { value: "last_6_months", label: "6 months" },
  { value: "year", label: "Year" },
];

type Props = {
  period: AnalyticsPeriodPreset;
  currency: string;
  currencies: string[];
  from?: string;
  to?: string;
};

function href(overrides: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(overrides)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/app/analytics?${qs}` : "/app/analytics";
}

export function AnalyticsFilters({
  period,
  currency,
  currencies,
  from,
  to,
}: Props) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((entry) => (
          <Link
            key={entry.value}
            href={href({
              period: entry.value,
              currency,
            })}
            className={cn(
              buttonVariants({
                variant: period === entry.value ? "default" : "outline",
                size: "sm",
              }),
            )}
          >
            {entry.label}
          </Link>
        ))}
        <Link
          href={href({
            period: "custom",
            currency,
            from: from ?? undefined,
            to: to ?? undefined,
          })}
          className={cn(
            buttonVariants({
              variant: period === "custom" ? "default" : "outline",
              size: "sm",
            }),
          )}
        >
          Custom
        </Link>
      </div>

      {currencies.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-sm text-muted-foreground">
            Currency
          </span>
          {currencies.map((code) => (
            <Link
              key={code}
              href={href({
                period,
                currency: code,
                from: period === "custom" ? from : null,
                to: period === "custom" ? to : null,
              })}
              className={cn(
                buttonVariants({
                  variant: currency === code ? "default" : "outline",
                  size: "sm",
                }),
              )}
            >
              {code}
            </Link>
          ))}
        </div>
      ) : null}

      {period === "custom" ? (
        <form className="flex flex-wrap items-end gap-2" method="get">
          <input type="hidden" name="period" value="custom" />
          <input type="hidden" name="currency" value={currency} />
          <label className="grid gap-1 text-sm">
            From
            <input
              type="date"
              name="from"
              defaultValue={from}
              required
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            />
          </label>
          <label className="grid gap-1 text-sm">
            To
            <input
              type="date"
              name="to"
              defaultValue={to}
              required
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            Apply
          </button>
        </form>
      ) : null}
    </div>
  );
}
