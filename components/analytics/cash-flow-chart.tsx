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
import type { MonthlyCashFlowPoint } from "@/lib/calculations/analytics";

type Props = {
  series: MonthlyCashFlowPoint[];
  currency: string;
};

export function CashFlowChart({ series, currency }: Props) {
  if (series.length === 0) {
    return <ChartEmpty message="No cash-flow series for this period." />;
  }

  const data = series.map((point) => ({
    month: point.month,
    net: Number(point.net),
  }));

  return (
    <div className="h-72 w-full" role="img" aria-label="Net cash flow by month">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="month" tick={axisTick} />
          <YAxis tick={axisTick} width={56} />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            formatter={(value) => [
              displayMoney(Number(value ?? 0).toFixed(2), currency),
              "Net cash flow",
            ]}
          />
          <Legend formatter={legendText} />
          <Line
            type="monotone"
            dataKey="net"
            name="Net cash flow"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <ul className="sr-only">
        {series.map((point) => (
          <li key={point.month}>
            {point.month}: {displayMoney(point.net, currency)}
          </li>
        ))}
      </ul>
    </div>
  );
}
