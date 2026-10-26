"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartEmpty } from "@/components/analytics/chart-empty";
import {
  axisTick,
  legendText,
  tooltipContentStyle,
  tooltipLabelStyle,
} from "@/components/analytics/chart-theme";
import { displayMoney } from "@/lib/calculations/money";
import type { ForecastCashFlowPoint } from "@/lib/calculations/forecast";

type Props = {
  series: ForecastCashFlowPoint[];
  currency: string;
};

export function ForecastBalanceChart({ series, currency }: Props) {
  if (series.length === 0) {
    return <ChartEmpty message="No forecast series for this horizon." />;
  }

  // Downsample long horizons for readability (keep first, last, and every Nth).
  const step = series.length > 45 ? Math.ceil(series.length / 30) : 1;
  const sampled = series.filter(
    (_, index) => index % step === 0 || index === series.length - 1,
  );

  const data = sampled.map((point) => ({
    date: point.date,
    forecastBalance: Number(point.forecastBalance),
  }));

  return (
    <div
      className="h-64 w-full"
      role="img"
      aria-label={`Forecast balance over horizon (${currency})`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis tick={axisTick} width={56} />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            formatter={(value) => [
              displayMoney(Number(value ?? 0).toFixed(2), currency),
              "Forecast balance",
            ]}
          />
          <Legend formatter={legendText} />
          <Line
            type="monotone"
            dataKey="forecastBalance"
            name="Forecast balance"
            stroke="var(--chart-2)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <ul className="sr-only">
        {sampled.map((point) => (
          <li key={point.date}>
            {point.date}: forecast {displayMoney(point.forecastBalance, currency)}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">
        Dashed line = forecast only. No fabricated history.
      </p>
    </div>
  );
}
