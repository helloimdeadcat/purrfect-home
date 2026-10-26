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
import type { MonthlyCashFlowPoint } from "@/lib/calculations/analytics";

type Props = {
  series: MonthlyCashFlowPoint[];
  currency: string;
};

export function IncomeExpenseChart({ series, currency }: Props) {
  if (series.length === 0) {
    return <ChartEmpty message="No monthly income/expense data for this period." />;
  }

  const data = series.map((point) => ({
    month: point.month,
    income: Number(point.income),
    expense: Number(point.expense),
  }));

  return (
    <div className="h-72 w-full" role="img" aria-label="Income and expenses by month">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="month" tick={axisTick} />
          <YAxis tick={axisTick} width={56} />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            formatter={(value, name) => [
              displayMoney(Number(value ?? 0).toFixed(2), currency),
              name === "income" ? "Income" : "Expense",
            ]}
          />
          <Legend formatter={legendText} />
          <Bar dataKey="income" name="Income" fill="var(--income-mark)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name="Expense" fill="var(--expense-mark)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <ul className="sr-only">
        {series.map((point) => (
          <li key={point.month}>
            {point.month}: income {displayMoney(point.income, currency)}, expense{" "}
            {displayMoney(point.expense, currency)}
          </li>
        ))}
      </ul>
    </div>
  );
}
