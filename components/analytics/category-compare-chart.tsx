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
  numberTick,
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
      <ChartEmpty message="Нет данных для сравнения категорий за эти периоды." />
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
      aria-label="Расходы по категориям в сравнении с прошлым периодом"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis type="number" tick={axisTick} tickFormatter={numberTick} />
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
              name,
            ]}
          />
          <Legend formatter={legendText} />
          <Bar dataKey="previous" name="Раньше" fill="var(--chart-neutral)" radius={[0, 4, 4, 0]} />
          <Bar dataKey="current" name="Сейчас" fill="var(--expense-mark)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <ul className="sr-only">
        {top.map((row) => (
          <li key={`${row.categoryId}-${row.categoryName}`}>
            {row.categoryName}: сейчас {displayMoney(row.current, currency)},
            раньше {displayMoney(row.previous, currency)}
          </li>
        ))}
      </ul>
    </div>
  );
}
