"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import type { CategoryComparisonRow } from "@/lib/calculations/analytics";

type Props = {
  rows: CategoryComparisonRow[];
  currency: string;
};

export function CategoryCompareChart({ rows, currency }: Props) {
  const top = rows.slice(0, 8);
  if (top.length === 0) {
    return (
      <ChartEmpty message="No category comparison data for these periods." />
    );
  }

  const data = top.map((row) => ({
    name: row.categoryName,
    current: Number(row.current),
    previous: Number(row.previous),
  }));

  return (
    <div
      className="h-80 w-full"
      role="img"
      aria-label="Category expenses compared to previous period"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis type="number" tick={axisTick} />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            formatter={(value, name) => [
              displayMoney(Number(value ?? 0).toFixed(2), currency),
              name === "current" ? "Current" : "Previous",
            ]}
          />
          <Legend formatter={legendText} />
          <Bar dataKey="previous" name="Previous" fill="var(--chart-neutral)" radius={[0, 4, 4, 0]} />
          <Bar dataKey="current" name="Current" fill="var(--expense-mark)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <ul className="sr-only">
        {top.map((row) => (
          <li key={`${row.categoryId}-${row.categoryName}`}>
            {row.categoryName}: current {displayMoney(row.current, currency)},
            previous {displayMoney(row.previous, currency)}
          </li>
        ))}
      </ul>
    </div>
  );
}
