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
import type { BudgetAnalyticsRow } from "@/services/analytics-service";

type Props = {
  rows: BudgetAnalyticsRow[];
  currency: string;
  month: string;
};

export function BudgetProgressChart({ rows, currency, month }: Props) {
  if (rows.length === 0) {
    return (
      <ChartEmpty
        message={`No monthly budgets in ${currency} for ${month}.`}
      />
    );
  }

  const data = rows.map((row) => ({
    name: row.categoryName ?? "Category",
    limit: Number(row.limit),
    spent: Number(row.spent),
  }));

  return (
    <div
      className="h-80 w-full"
      role="img"
      aria-label={`Budget limit versus spent for ${month}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis tick={axisTick} width={56} />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            formatter={(value, name) => [
              displayMoney(Number(value ?? 0).toFixed(2), currency),
              name === "limit" ? "Budget" : "Spent",
            ]}
          />
          <Legend formatter={legendText} />
          <Bar dataKey="limit" name="Budget" fill="var(--chart-neutral)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="spent" name="Spent" fill="var(--expense-mark)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <ul className="sr-only">
        {rows.map((row) => (
          <li key={row.budgetId}>
            {row.categoryName}: spent {displayMoney(row.spent, currency)} of{" "}
            {displayMoney(row.limit, currency)} ({row.percentUsed}%, {row.status})
          </li>
        ))}
      </ul>
    </div>
  );
}
