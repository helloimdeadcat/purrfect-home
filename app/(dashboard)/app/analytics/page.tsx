import { redirect } from "next/navigation";

import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { BudgetProgressChart } from "@/components/analytics/budget-progress-chart";
import { CashFlowChart } from "@/components/analytics/cash-flow-chart";
import { CategoryCompareChart } from "@/components/analytics/category-compare-chart";
import { CategoryExpenseChart } from "@/components/analytics/category-expense-chart";
import { ChangeBadge } from "@/components/analytics/change-badge";
import { StatCard } from "@/components/cute/stat-card";
import { IncomeExpenseChart } from "@/components/analytics/income-expense-chart";
import { ForecastPanel } from "@/components/forecast/forecast-panel";
import { getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { displayMoney } from "@/lib/calculations/money";
import { analyticsQuerySchema } from "@/lib/validations/analytics";
import { forecastQuerySchema } from "@/lib/validations/forecast";
import { getAnalyticsReport } from "@/services/analytics-service";
import { getForecastReport } from "@/services/forecast-service";

type Props = {
  searchParams: Promise<{
    period?: string;
    currency?: string;
    from?: string;
    to?: string;
    accountId?: string;
    horizon?: string;
  }>;
};

export default async function AnalyticsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const parsed = analyticsQuerySchema.safeParse({
    period: params.period,
    currency: params.currency,
    from: params.from,
    to: params.to,
    accountId: params.accountId,
  });

  if (!parsed.success) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-destructive" role="alert">
          Invalid filters. Check period and dates.
        </p>
      </div>
    );
  }

  const forecastParsed = forecastQuerySchema.safeParse({
    horizon: params.horizon,
    currency: params.currency ?? parsed.data.currency,
    from: params.from,
    to: params.to,
  });

  const [{ data: report, error }, forecastResult] = await Promise.all([
    getAnalyticsReport(supabase, ctx, parsed.data),
    forecastParsed.success
      ? getForecastReport(supabase, ctx, forecastParsed.data)
      : Promise.resolve({
          data: null,
          error: {
            code: "VALIDATION" as const,
            message: "Invalid forecast filters",
          },
        }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Actual income and expenses for {ctx.householdName}. Amounts stay
          separated by currency — no FX conversion.
        </p>
      </div>

      <AnalyticsFilters
        period={parsed.data.period}
        currency={
          report?.currency ??
          parsed.data.currency ??
          ctx.currency.toUpperCase()
        }
        currencies={
          report?.availableCurrencies?.length
            ? report.availableCurrencies
            : [ctx.currency.toUpperCase()]
        }
        from={parsed.data.from}
        to={parsed.data.to}
      />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}

      {!error && report ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {report.range.start} → {report.range.end} · {report.currency}
              {report.empty ? " · no transactions in this period" : ""}
            </p>
            <a
              href={`/api/export/analytics?${new URLSearchParams({
                period: parsed.data.period,
                currency: report.currency,
                ...(parsed.data.from ? { from: parsed.data.from } : {}),
                ...(parsed.data.to ? { to: parsed.data.to } : {}),
                ...(parsed.data.accountId ? { accountId: parsed.data.accountId } : {}),
              }).toString()}`}
              className="text-sm underline-offset-4 hover:underline"
              download
            >
              Export CSV
            </a>
          </div>

          <section className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Income"
              tone="income"
              value={displayMoney(report.summary.income, report.currency)}
              footer={
                <ChangeBadge label="Change" change={report.summary.incomeChange} />
              }
            />
            <StatCard
              label="Expenses"
              tone="expense"
              value={displayMoney(report.summary.expense, report.currency)}
              footer={
                <ChangeBadge
                  label="Change"
                  change={report.summary.expenseChange}
                />
              }
            />
            <StatCard
              label="Net cash flow"
              value={displayMoney(report.summary.net, report.currency)}
              footer={
                <ChangeBadge label="Change" change={report.summary.netChange} />
              }
            />
          </section>

          <section className="grid gap-3">
            <h2 className="font-medium">Income vs expenses</h2>
            <IncomeExpenseChart
              series={report.cashFlow}
              currency={report.currency}
            />
          </section>

          <section className="grid gap-3">
            <h2 className="font-medium">Cash flow</h2>
            <CashFlowChart series={report.cashFlow} currency={report.currency} />
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <div className="grid gap-3">
              <h2 className="font-medium">Expenses by category</h2>
              <CategoryExpenseChart
                slices={report.expensesByCategory}
                currency={report.currency}
              />
            </div>
            <div className="grid gap-3">
              <h2 className="font-medium">Category comparison</h2>
              <CategoryCompareChart
                rows={report.categoryComparison}
                currency={report.currency}
              />
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="font-medium">
              Budgets vs spent ({report.budgets.month})
            </h2>
            <BudgetProgressChart
              rows={report.budgets.rows}
              currency={report.currency}
              month={report.budgets.month}
            />
          </section>

          <section className="grid gap-3 card-soft p-4">
            <h2 className="font-medium">Period report</h2>
            <ReportBlock
              title="Expenses by category"
              rows={report.expensesByCategory.map((row) => ({
                label: row.categoryName,
                amount: displayMoney(row.amount, report.currency),
              }))}
            />
            <ReportBlock
              title="Income by category"
              rows={report.incomeByCategory.map((row) => ({
                label: row.categoryName,
                amount: displayMoney(row.amount, report.currency),
              }))}
            />
            <ReportBlock
              title="Income by source"
              rows={report.incomeBySource.map((row) => ({
                label: row.sourceName,
                amount: displayMoney(row.amount, report.currency),
              }))}
            />
            <div className="grid gap-1 text-sm">
              <p>
                Prior period {report.previousRange.start} →{" "}
                {report.previousRange.end}: income{" "}
                {displayMoney(report.summary.previousIncome, report.currency)},
                expenses{" "}
                {displayMoney(report.summary.previousExpense, report.currency)},
                net {displayMoney(report.summary.previousNet, report.currency)}
              </p>
            </div>
          </section>

          <div className="border-t border-border pt-6">
            <p className="mb-3 text-sm text-muted-foreground">
              Actual analytics above · forecast below (separate models).
            </p>
            {forecastResult.error ? (
              <p className="text-sm text-destructive" role="alert">
                Forecast unavailable: {forecastResult.error.message}
              </p>
            ) : forecastResult.data ? (
              <ForecastPanel
                report={forecastResult.data}
                basePath="/app/analytics"
                preserve={{
                  period: parsed.data.period,
                  currency: report.currency,
                  from: parsed.data.from,
                  to: parsed.data.to,
                }}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ReportBlock({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; amount: string }[];
}) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rows.</p>
      ) : (
        <ul className="grid gap-1 text-sm">
          {rows.map((row) => (
            <li
              key={`${title}-${row.label}`}
              className="flex justify-between gap-3"
            >
              <span>{row.label}</span>
              <span className="tabular-nums">{row.amount}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
