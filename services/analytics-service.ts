import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import {
  aggregateByCategory,
  aggregateByIncomeSource,
  aggregateMonthlyCashFlow,
  collectCurrencies,
  compareCategoryExpenses,
  filterAnalyticsTxns,
  percentChangeMoney,
  sumIncomeExpense,
  type AnalyticsTxn,
  type CategoryAmount,
  type CategoryComparisonRow,
  type MonthlyCashFlowPoint,
  type PercentChangeResult,
} from "@/lib/calculations/analytics";
import {
  previousComparablePeriod,
  resolveAnalyticsPeriod,
  type AnalyticsPeriodPreset,
  type DateRange,
} from "@/lib/calculations/analytics-period";
import {
  formatYearMonth,
  monthEndIso,
  monthStartIso,
  parseYearMonth,
} from "@/lib/calculations/budget-month";
import { asMoney, zeroMoney } from "@/lib/calculations/money";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import type { AnalyticsQueryInput } from "@/lib/validations/analytics";
import { listBudgetsForMonth } from "@/services/budget-service";
import { getHouseholdToday } from "@/services/settings-service";
import type { Database, Money } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB";
  message: string;
};

export type BudgetAnalyticsRow = {
  budgetId: string;
  categoryId: string | null;
  categoryName: string | null;
  limit: Money;
  spent: Money;
  remaining: Money;
  percentUsed: number;
  status: string;
  currency: string;
};

export type AnalyticsReport = {
  currency: string;
  availableCurrencies: string[];
  period: AnalyticsPeriodPreset;
  range: DateRange;
  previousRange: DateRange;
  summary: {
    income: Money;
    expense: Money;
    net: Money;
    previousIncome: Money;
    previousExpense: Money;
    previousNet: Money;
    incomeChange: PercentChangeResult;
    expenseChange: PercentChangeResult;
    netChange: PercentChangeResult;
  };
  cashFlow: MonthlyCashFlowPoint[];
  expensesByCategory: CategoryAmount[];
  incomeByCategory: CategoryAmount[];
  incomeBySource: {
    sourceId: string | null;
    sourceName: string;
    amount: Money;
  }[];
  categoryComparison: CategoryComparisonRow[];
  budgets: {
    month: string;
    rows: BudgetAnalyticsRow[];
  };
  empty: boolean;
};

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

function toTxn(row: {
  type: string;
  amount: string | number;
  currency: string;
  transaction_date: string;
  category_id: string | null;
  income_source_id: string | null;
  account_id: string;
  deleted_at: string | null;
}): AnalyticsTxn | null {
  if (row.type !== "income" && row.type !== "expense") return null;
  return {
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    transaction_date: row.transaction_date,
    category_id: row.category_id,
    income_source_id: row.income_source_id,
    account_id: row.account_id,
    deleted_at: row.deleted_at,
  };
}

export async function getAnalyticsReport(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: AnalyticsQueryInput,
): Promise<{ data: AnalyticsReport | null; error: ServiceError | null }> {
  const { today } = await getHouseholdToday(supabase, ctx);
  let range: DateRange;
  try {
    range = resolveAnalyticsPeriod(input.period, {
      from: input.from,
      to: input.to,
      today,
    });
  } catch (error) {
    return {
      data: null,
      error: err(
        "VALIDATION",
        error instanceof Error ? error.message : "Неверный период",
      ),
    };
  }

  const previousRange = previousComparablePeriod(range);
  const fetchStart =
    previousRange.start < range.start ? previousRange.start : range.start;

  const { data: accountRows, error: accountsError } = await supabase
    .from("accounts")
    .select("currency")
    .eq("household_id", ctx.householdId);

  if (accountsError) {
    return { data: null, error: err("DB", accountsError.message) };
  }

  if (input.accountId) {
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", input.accountId)
      .eq("household_id", ctx.householdId)
      .maybeSingle();
    if (accountError) {
      return { data: null, error: err("DB", accountError.message) };
    }
    if (!account) {
      return { data: null, error: err("VALIDATION", "Счёт не найден") };
    }
  }

  const { data: rawTxns, error: txError } = await fetchAllPages((from, to) =>
    supabase
      .from("transactions")
      .select(
        "id, type, amount, currency, transaction_date, category_id, income_source_id, account_id, deleted_at",
      )
      .eq("household_id", ctx.householdId)
      .is("deleted_at", null)
      .in("type", ["income", "expense"])
      .gte("transaction_date", fetchStart)
      .lte("transaction_date", range.end)
      .order("transaction_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  if (txError) {
    return { data: null, error: err("DB", txError.message) };
  }

  const txns = (rawTxns ?? [])
    .map(toTxn)
    .filter((row): row is AnalyticsTxn => row != null);

  const availableCurrencies = [
    ...new Set([
      ...collectCurrencies(accountRows ?? []),
      ...collectCurrencies(txns),
      ctx.currency.toUpperCase(),
    ]),
  ].sort();

  const currency = (
    input.currency ??
    ctx.currency ??
    availableCurrencies[0] ??
    "EUR"
  ).toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    return { data: null, error: err("VALIDATION", "Неверная валюта") };
  }

  const currentRows = filterAnalyticsTxns(txns, {
    currency,
    range,
    accountId: input.accountId,
  });
  const previousRows = filterAnalyticsTxns(txns, {
    currency,
    range: previousRange,
    accountId: input.accountId,
  });

  const summary = sumIncomeExpense(currentRows);
  const previousSummary = sumIncomeExpense(previousRows);

  const categoryIds = [
    ...new Set(
      [...currentRows, ...previousRows]
        .map((row) => row.category_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const sourceIds = [
    ...new Set(
      currentRows
        .map((row) => row.income_source_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [{ data: categories }, { data: sources }] = await Promise.all([
    categoryIds.length
      ? supabase.from("categories").select("id, name").in("id", categoryIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    sourceIds.length
      ? supabase.from("income_sources").select("id, name").in("id", sourceIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const categoryNames = new Map(
    (categories ?? []).map((row) => [row.id, row.name]),
  );
  const sourceNames = new Map((sources ?? []).map((row) => [row.id, row.name]));

  const budgetMonth = parseYearMonth(range.end.slice(0, 7));
  const budgetsResult = await listBudgetsForMonth(
    supabase,
    ctx,
    formatYearMonth(budgetMonth.year, budgetMonth.month),
  );

  const budgetRows: BudgetAnalyticsRow[] = [];
  if (!budgetsResult.error && budgetsResult.data) {
    for (const budget of budgetsResult.data.budgets) {
      if (budget.currency.toUpperCase() !== currency) continue;
      budgetRows.push({
        budgetId: budget.id,
        categoryId: budget.category_id,
        categoryName: budget.categoryName,
        limit: asMoney(budget.amount),
        spent: budget.spent,
        remaining: budget.progress.remaining,
        percentUsed: budget.progress.percentUsed,
        status: budget.progress.status,
        currency: budget.currency,
      });
    }
  }

  const empty = currentRows.length === 0;

  return {
    data: {
      currency,
      availableCurrencies,
      period: input.period,
      range,
      previousRange,
      summary: {
        income: summary.income,
        expense: summary.expense,
        net: summary.net,
        previousIncome: previousSummary.income,
        previousExpense: previousSummary.expense,
        previousNet: previousSummary.net,
        incomeChange: percentChangeMoney(
          summary.income,
          previousSummary.income,
        ),
        expenseChange: percentChangeMoney(
          summary.expense,
          previousSummary.expense,
        ),
        netChange: percentChangeMoney(summary.net, previousSummary.net),
      },
      cashFlow: aggregateMonthlyCashFlow(currentRows, range),
      expensesByCategory: aggregateByCategory(
        currentRows,
        "expense",
        categoryNames,
      ),
      incomeByCategory: aggregateByCategory(
        currentRows,
        "income",
        categoryNames,
      ),
      incomeBySource: aggregateByIncomeSource(currentRows, sourceNames),
      categoryComparison: compareCategoryExpenses(
        currentRows,
        previousRows,
        categoryNames,
      ),
      budgets: {
        month: formatYearMonth(budgetMonth.year, budgetMonth.month),
        rows: budgetRows,
      },
      empty,
    },
    error: null,
  };
}

export async function getCashFlowSeries(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: AnalyticsQueryInput,
) {
  const report = await getAnalyticsReport(supabase, ctx, input);
  if (report.error || !report.data) return report;
  return {
    data: {
      currency: report.data.currency,
      range: report.data.range,
      series: report.data.cashFlow,
    },
    error: null,
  };
}

export async function getCategoryAnalytics(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: AnalyticsQueryInput,
) {
  const report = await getAnalyticsReport(supabase, ctx, input);
  if (report.error || !report.data) return report;
  return {
    data: {
      currency: report.data.currency,
      range: report.data.range,
      previousRange: report.data.previousRange,
      expensesByCategory: report.data.expensesByCategory,
      categoryComparison: report.data.categoryComparison,
    },
    error: null,
  };
}

export function emptyMoneySeries(range: DateRange): MonthlyCashFlowPoint[] {
  return aggregateMonthlyCashFlow([], range);
}

export { monthStartIso, monthEndIso, zeroMoney };
