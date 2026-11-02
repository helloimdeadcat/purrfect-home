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

export function IncomeExpenseChart({ series, currency }: Props) {
  if (series.length === 0) {
    return <ChartEmpty message="За этот период нет данных о доходах и расходах." />;
  }

  const data = series.map((point) => ({
    month: point.month,
    income: Number(point.income),
    expense: Number(point.expense),
  }));

  return (
    <div className="h-72 w-full" role="img" aria-label="Доходы и расходы по месяцам">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="month" tick={axisTick} tickFormatter={monthTick} />
          <YAxis tick={axisTick} width={56} tickFormatter={numberTick} />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            labelFormatter={(label) => monthLabel(String(label))}
            formatter={(value, name) => [
              displayMoney(Number(value ?? 0).toFixed(2), currency),
              name,
            ]}
          />
          <Legend formatter={legendText} />
          <Bar dataKey="income" name="Доход" fill="var(--income-mark)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name="Расход" fill="var(--expense-mark)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <ul className="sr-only">
        {series.map((point) => (
          <li key={point.month}>
            {monthLabel(point.month)}: доход {displayMoney(point.income, currency)}, расход{" "}
            {displayMoney(point.expense, currency)}
          </li>
        ))}
      </ul>
    </div>
  );
}
