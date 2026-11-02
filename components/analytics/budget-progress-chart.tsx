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
import type { BudgetAnalyticsRow } from "@/services/analytics-service";

const STATUS_LABELS: Record<string, string> = {
  empty: "пусто",
  under: "в пределах",
  warning: "почти лимит",
  reached: "лимит достигнут",
  over: "перерасход",
};

type Props = {
  rows: BudgetAnalyticsRow[];
  currency: string;
  month: string;
};

export function BudgetProgressChart({ rows, currency, month }: Props) {
  if (rows.length === 0) {
    return (
      <ChartEmpty
        message={`На ${month} нет месячных бюджетов в ${currency}.`}
      />
    );
  }

  const data = rows.map((row) => ({
    name: row.categoryName ?? "Категория",
    limit: Number(row.limit),
    spent: Number(row.spent),
  }));

  return (
    <div
      className="h-80 w-full"
      role="img"
      aria-label={`Лимит бюджета и траты за ${month}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis tick={axisTick} width={56} tickFormatter={numberTick} />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            formatter={(value, name) => [
              displayMoney(Number(value ?? 0).toFixed(2), currency),
              name,
            ]}
          />
          <Legend formatter={legendText} />
          <Bar dataKey="limit" name="Бюджет" fill="var(--chart-neutral)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="spent" name="Потрачено" fill="var(--expense-mark)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <ul className="sr-only">
        {rows.map((row) => (
          <li key={row.budgetId}>
            {row.categoryName}: потрачено {displayMoney(row.spent, currency)} из{" "}
            {displayMoney(row.limit, currency)} ({row.percentUsed}%, {STATUS_LABELS[row.status] ?? row.status})
          </li>
        ))}
      </ul>
    </div>
  );
}
