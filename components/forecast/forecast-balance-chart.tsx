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
  numberTick,
  tooltipContentStyle,
  tooltipLabelStyle,
} from "@/components/analytics/chart-theme";
import { displayMoney } from "@/lib/calculations/money";
import type { ForecastCashFlowPoint } from "@/lib/calculations/forecast";
import { LOCALE } from "@/lib/locale";

const dayTickFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const dayLabelFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatDay(iso: string, format: Intl.DateTimeFormat): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : format.format(date);
}

type Props = {
  series: ForecastCashFlowPoint[];
  currency: string;
};

export function ForecastBalanceChart({ series, currency }: Props) {
  if (series.length === 0) {
    return <ChartEmpty message="Для этого периода прогноза пока нет данных." />;
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
      aria-label={`Прогноз баланса на период (${currency})`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            minTickGap={24}
            tickFormatter={(value) => formatDay(String(value), dayTickFormat)}
          />
          <YAxis tick={axisTick} width={56} tickFormatter={numberTick} />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            labelFormatter={(label) => formatDay(String(label), dayLabelFormat)}
            formatter={(value) => [
              displayMoney(Number(value ?? 0).toFixed(2), currency),
              "Прогноз баланса",
            ]}
          />
          <Legend formatter={legendText} />
          <Line
            type="monotone"
            dataKey="forecastBalance"
            name="Прогноз баланса"
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
            {formatDay(point.date, dayLabelFormat)}: прогноз {displayMoney(point.forecastBalance, currency)}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">
        Пунктир — это только прогноз, прошлое мы не выдумываем 🐾
      </p>
    </div>
  );
}
