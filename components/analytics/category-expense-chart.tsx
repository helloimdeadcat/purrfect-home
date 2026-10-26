"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { ChartEmpty } from "@/components/analytics/chart-empty";
import {
  legendText,
  tooltipContentStyle,
  tooltipLabelStyle,
} from "@/components/analytics/chart-theme";
import { displayMoney } from "@/lib/calculations/money";
import type { CategoryAmount } from "@/lib/calculations/analytics";

/** Fixed categorical order from the theme (validated per light/dark). */
const COLORS = Array.from({ length: 8 }, (_, i) => `var(--chart-${i + 1})`);
const MAX_SLICES = COLORS.length;

/**
 * Colours are never cycled: beyond 8 categories the tail folds into "Other"
 * (7 largest + Other), so every slice keeps a distinct, stable hue.
 */
export function foldSlices(
  slices: { name: string; value: number }[],
): { name: string; value: number }[] {
  if (slices.length <= MAX_SLICES) return slices;
  const sorted = [...slices].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, MAX_SLICES - 1);
  const rest = sorted.slice(MAX_SLICES - 1).reduce((sum, s) => sum + s.value, 0);
  return [...head, { name: "Other", value: Math.round(rest * 100) / 100 }];
}

type Props = {
  slices: CategoryAmount[];
  currency: string;
};

export function CategoryExpenseChart({ slices, currency }: Props) {
  if (slices.length === 0) {
    return <ChartEmpty message="No expenses by category in this period." />;
  }

  const data = foldSlices(
    slices.map((slice) => ({
      name: slice.categoryName,
      value: Number(slice.amount),
    })),
  );

  return (
    <div
      className="h-80 w-full"
      role="img"
      aria-label="Expense distribution by category"
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={100}
            paddingAngle={1}
            stroke="var(--card)"
            strokeWidth={2}
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            formatter={(value) =>
              displayMoney(Number(value ?? 0).toFixed(2), currency)
            }
          />
          <Legend formatter={legendText} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="sr-only">
        {slices.map((slice) => (
          <li key={`${slice.categoryId}-${slice.categoryName}`}>
            {slice.categoryName}: {displayMoney(slice.amount, currency)}
          </li>
        ))}
      </ul>
    </div>
  );
}
