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
  monthLabel,
  monthTick,
  numberTick,
  tooltipContentStyle,
  tooltipLabelStyle,
} from "@/components/analytics/chart-theme";
import { displayMoney } from "@/lib/calculations/money";
import type { MonthlyCashFlowPoint } from "@/lib/calculations/analytics";

type Props = {
  series: MonthlyCashFlowPoint[];
  currency: string;
};

export function CashFlowChart({ series, currency }: Props) {
  if (series.length === 0) {
    return <ChartEmpty message="За этот период нет данных о движении денег." />;
  }

  const data = series.map((point) => ({
    month: point.month,
    net: Number(point.net),
  }));

  return (
    <div className="h-72 w-full" role="img" aria-label="Чистое движение денег по месяцам">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="month" tick={axisTick} tickFormatter={monthTick} />
          <YAxis tick={axisTick} width={56} tickFormatter={numberTick} />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            labelFormatter={(label) => monthLabel(String(label))}
            formatter={(value) => [
              displayMoney(Number(value ?? 0).toFixed(2), currency),
              "Чистое движение денег",
            ]}
          />
          <Legend formatter={legendText} />
          <Line
            type="monotone"
            dataKey="net"
            name="Чистое движение денег"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <ul className="sr-only">
        {series.map((point) => (
          <li key={point.month}>
            {monthLabel(point.month)}: {displayMoney(point.net, currency)}
          </li>
        ))}
      </ul>
    </div>
  );
}
