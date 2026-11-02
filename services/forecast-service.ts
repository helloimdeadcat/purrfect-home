import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import {
  buildForecast,
  type BuildForecastResult,
  type CurrencyForecast,
  type ForecastCandidateEvent,
  type ForecastCashFlowPoint,
  type ForecastExcludedEvent,
  type ForecastIncludedEvent,
} from "@/lib/calculations/forecast";
import {
  resolveForecastHorizon,
  type ForecastDateRange,
  type ForecastHorizonPreset,
} from "@/lib/calculations/forecast-horizon";
import { formatYearMonth } from "@/lib/calculations/budget-month";
import { asMoney, compareMoney, zeroMoney } from "@/lib/calculations/money";
import {
  isPast,
  listRecurringDatesInRange,
} from "@/lib/calculations/recurring-dates";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import type { ForecastQueryInput } from "@/lib/validations/forecast";
import {
  listAccountsWithBalances,
  summarizeHouseholdWealth,
  type AccountWithBalance,
} from "@/services/account-service";
import { listBudgetsForMonth } from "@/services/budget-service";
import {
  getHouseholdSettings,
  householdTodayFromSettings,
} from "@/services/settings-service";
import type { Database, Money } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB";
  message: string;
};

export type BudgetHeadroomRow = {
  budgetId: string;
  categoryId: string | null;
  categoryName: string | null;
  limit: Money;
  spent: Money;
  remaining: Money;
  percentUsed: number;
  status: string;
  currency: string;
  nearLimit: boolean;
};

export type ForecastReport = {
  calculatedAt: string;
  timezone: string;
  today: string;
  horizon: ForecastHorizonPreset;
  range: ForecastDateRange;
  /** True when household settings define a positive reserve for any currency. */
  reserveConfigured: boolean;
  currencies: CurrencyForecast[];
  /** Filtered view when ?currency= is set; otherwise all. */
  focusCurrency: string | null;
  includedObligations: ForecastIncludedEvent[];
  excludedEvents: ForecastExcludedEvent[];
  budgetHeadroom: {
    month: string;
    rows: BudgetHeadroomRow[];
  };
  cashFlowByCurrency: Record<string, ForecastCashFlowPoint[]>;
  warnings: string[];
  formulas: {
    forecastBalance: string;
    safeToSpend: string;
  };
};

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

/** Columns buildCandidates reads (lean callers select only these). */
export type ForecastPaymentRow = Pick<
  Database["public"]["Tables"]["recurring_payments"]["Row"],
  | "id"
  | "name"
  | "type"
  | "amount"
  | "currency"
  | "start_date"
  | "end_date"
  | "frequency"
  | "interval_days"
  | "day_of_month"
  | "weekday"
> & { is_mandatory?: boolean | null };

export type ForecastOccurrenceRow = Pick<
  Database["public"]["Tables"]["recurring_payment_occurrences"]["Row"],
  "id" | "recurring_payment_id" | "scheduled_date" | "status" | "amount" | "transaction_id"
>;

/** Recurring payments + occurrences → forecast candidates (shared with the morning digest). */
export function buildCandidates(input: {
  payments: ForecastPaymentRow[];
  occurrences: ForecastOccurrenceRow[];
  today: string;
  horizonEnd: string;
  fallbackCurrency: string;
}): ForecastCandidateEvent[] {
  const { payments, occurrences, today, horizonEnd, fallbackCurrency } = input;
  const payMap = new Map(payments.map((p) => [p.id, p]));
  const occDatesByPayment = new Map<string, Set<string>>();
  const candidates: ForecastCandidateEvent[] = [];

  // Load occurrences from well before today so overdue pending still appear.
  for (const occ of occurrences) {
    const payment = payMap.get(occ.recurring_payment_id);
    if (!payment) continue;

    let status = occ.status;
    if (status === "pending" && isPast(occ.scheduled_date, today)) {
      status = "overdue";
    }

    candidates.push({
      id: `occ:${occ.id}`,
      paymentId: occ.recurring_payment_id,
      date: occ.scheduled_date,
      name: payment.name,
      amount: asMoney(occ.amount ?? payment.amount),
      currency: payment.currency || fallbackCurrency,
      cashFlow: payment.type === "income" ? "income" : "expense",
      source: "occurrence",
      status,
      transactionId: occ.transaction_id,
      isMandatory: payment.is_mandatory !== false,
    });

    const set = occDatesByPayment.get(occ.recurring_payment_id) ?? new Set();
    set.add(occ.scheduled_date);
    occDatesByPayment.set(occ.recurring_payment_id, set);
  }

  for (const payment of payments) {
    if (payment.type !== "income" && payment.type !== "expense") continue;

    const projected = listRecurringDatesInRange(
      {
        startDate: payment.start_date,
        endDate: payment.end_date,
        frequency: payment.frequency,
        intervalDays: payment.interval_days,
        dayOfMonth: payment.day_of_month,
        weekday: payment.weekday,
      },
      today,
      horizonEnd,
    );
    const existing = occDatesByPayment.get(payment.id) ?? new Set();
    for (const date of projected) {
      if (existing.has(date)) continue;
      candidates.push({
        id: `proj:${payment.id}:${date}`,
        paymentId: payment.id,
        date,
        name: payment.name,
        amount: asMoney(payment.amount),
        currency: payment.currency || fallbackCurrency,
        cashFlow: payment.type === "income" ? "income" : "expense",
        source: "projected",
        status: "scheduled",
        transactionId: null,
        isMandatory: payment.is_mandatory !== false,
      });
    }
  }

  return candidates;
}

function balancesRecord(
  accounts: Awaited<ReturnType<typeof listAccountsWithBalances>>["data"],
  baseCurrency: string,
): Record<string, Money> {
  const wealth = summarizeHouseholdWealth(accounts ?? [], baseCurrency);
  const record: Record<string, Money> = {
    [wealth.baseCurrency.toUpperCase()]: wealth.baseTotal,
  };
  for (const other of wealth.otherCurrencies) {
    record[other.currency.toUpperCase()] = other.total;
  }
  // Ensure every active account currency appears even if zero after filter quirks
  for (const account of accounts ?? []) {
    if (!account.is_active) continue;
    const code = account.currency.toUpperCase();
    if (!(code in record)) {
      record[code] = zeroMoney();
    }
  }
  return record;
}

export type ForecastPrefetch = {
  /** Skip a second full transaction scan when the caller already has balances. */
  accounts?: AccountWithBalance[] | null;
};

/**
 * Build household forecast + Safe-to-Spend for the selected horizon.
 * Does not mix currencies. Does not subtract budgets from Safe-to-Spend.
 */
export async function getForecastReport(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: ForecastQueryInput,
  prefetch: ForecastPrefetch = {},
): Promise<{ data: ForecastReport | null; error: ServiceError | null }> {
  const settingsResult = await getHouseholdSettings(supabase, ctx);
  const { timezone, today } = householdTodayFromSettings(settingsResult.data);
  // Absent before the reserve migration is applied → no reserve.
  const reserveByCurrency = settingsResult.data?.safe_to_spend_reserves ?? {};
  let range: ForecastDateRange;
  try {
    range = resolveForecastHorizon(input.horizon, {
      today,
      from: input.from,
      to: input.to,
    });
  } catch (error) {
    return {
      data: null,
      error: err(
        "VALIDATION",
        error instanceof Error ? error.message : "Неверный горизонт прогноза",
      ),
    };
  }

  const accountsPromise =
    prefetch.accounts !== undefined
      ? Promise.resolve({
          data: prefetch.accounts ?? [],
          error: null as ServiceError | null,
        })
      : listAccountsWithBalances(supabase, ctx);

  const [accountsResult, paymentsResult, occResult, budgetsResult] =
    await Promise.all([
      accountsPromise,
      fetchAllPages((from, to) =>
        supabase
          .from("recurring_payments")
          .select("*")
          .eq("household_id", ctx.householdId)
          .eq("is_archived", false)
          .eq("is_active", true)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllPages((from, to) =>
        supabase
          .from("recurring_payment_occurrences")
          .select("*")
          .eq("household_id", ctx.householdId)
          .lte("scheduled_date", range.end)
          .or(
            `scheduled_date.gte.${today},status.in.(pending,overdue)`,
          )
          .order("scheduled_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      listBudgetsForMonth(
        supabase,
        ctx,
        formatYearMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7))),
      ),
    ]);

  if (accountsResult.error) {
    return { data: null, error: accountsResult.error };
  }
  if (paymentsResult.error) {
    return { data: null, error: err("DB", paymentsResult.error.message) };
  }
  if (occResult.error) {
    return { data: null, error: err("DB", occResult.error.message) };
  }

  const balancesByCurrency = balancesRecord(
    accountsResult.data,
    ctx.currency.toUpperCase(),
  );

  const candidates = buildCandidates({
    payments: paymentsResult.data ?? [],
    occurrences: occResult.data ?? [],
    today,
    horizonEnd: range.end,
    fallbackCurrency: ctx.currency,
  });

  const built: BuildForecastResult = buildForecast({
    today,
    horizonEnd: range.end,
    balancesByCurrency,
    candidates,
    reserveByCurrency,
  });
  const reserveConfigured = Object.values(reserveByCurrency).some(
    (value) => compareMoney(asMoney(value), zeroMoney()) > 0,
  );

  const focus = input.currency?.toUpperCase() ?? null;
  let currencies = built.byCurrency;
  let included = built.included;
  let excluded = built.excluded;
  let cashFlowByCurrency = built.cashFlowByCurrency;

  if (focus) {
    currencies = built.byCurrency.filter((c) => c.currency === focus);
    if (currencies.length === 0 && focus in balancesByCurrency) {
      // Still return a zeroed forecast row for the requested currency
      currencies = built.byCurrency.filter((c) => c.currency === focus);
    }
    included = built.included.filter((e) => e.currency === focus);
    excluded = built.excluded.filter((e) => e.currency === focus);
    cashFlowByCurrency = {
      [focus]: built.cashFlowByCurrency[focus] ?? [],
    };
  }

  const budgetRows: BudgetHeadroomRow[] = [];
  const budgetMonth =
    budgetsResult.data?.month ??
    formatYearMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)));

  if (!budgetsResult.error && budgetsResult.data) {
    for (const budget of budgetsResult.data.budgets) {
      if (focus && budget.currency.toUpperCase() !== focus) continue;
      const nearLimit =
        budget.progress.status === "warning" ||
        budget.progress.status === "reached" ||
        budget.progress.status === "over";
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
        nearLimit,
      });
    }
  }

  const report: ForecastReport = {
    calculatedAt: new Date().toISOString(),
    timezone,
    today,
    horizon: input.horizon,
    range,
    reserveConfigured,
    currencies,
    focusCurrency: focus,
    includedObligations: included.filter((e) => e.cashFlow === "expense"),
    excludedEvents: excluded,
    budgetHeadroom: {
      month: budgetMonth,
      rows: budgetRows,
    },
    cashFlowByCurrency,
    warnings: built.warnings,
    formulas: {
      forecastBalance:
        "Прогноз баланса = текущий баланс + ожидаемый доход − ожидаемый расход (по каждой валюте; учитываются только регулярные платежи)",
      safeToSpend:
        "«Можно потратить» = текущий баланс − обязательные платежи − резерв (резерв по валюте из настроек; необязательные регулярные платежи, доходы и бюджеты не учитываются)",
    },
  };

  // When focusing a currency that has no row yet, synthesise empty row.
  if (focus && report.currencies.length === 0) {
    report.currencies = [
      {
        currency: focus,
        currentBalance: asMoney(balancesByCurrency[focus] ?? zeroMoney()),
        expectedIncome: zeroMoney(),
        expectedExpense: zeroMoney(),
        forecastBalance: asMoney(balancesByCurrency[focus] ?? zeroMoney()),
        safeToSpend: asMoney(balancesByCurrency[focus] ?? zeroMoney()),
        isDeficit: false,
        deficitAmount: zeroMoney(),
        reserve: zeroMoney(),
        mandatoryOutflows: zeroMoney(),
      },
    ];
  }

  return { data: report, error: null };
}
