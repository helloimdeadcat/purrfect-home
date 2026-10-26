import {
  addMoney,
  asMoney,
  compareMoney,
  subtractMoney,
  zeroMoney,
  type MoneyInput,
} from "@/lib/calculations/money";
import type { Money } from "@/types/database";

export type ForecastEventStatus =
  | "pending"
  | "overdue"
  | "paid"
  | "skipped"
  | "scheduled";

export type ForecastEventSource = "occurrence" | "projected";

/**
 * Candidate recurring event before eligibility filtering.
 * Transfers and deleted transactions never appear here.
 */
export type ForecastCandidateEvent = {
  id: string;
  paymentId: string;
  date: string;
  name: string;
  amount: MoneyInput;
  currency: string;
  cashFlow: "income" | "expense";
  source: ForecastEventSource;
  status: ForecastEventStatus;
  transactionId?: string | null;
  /**
   * Optional (non-mandatory) expenses still lower the forecast balance but
   * not Safe-to-Spend. Missing means mandatory (pre-flag behaviour).
   */
  isMandatory?: boolean;
};

export type ForecastIncludedEvent = {
  id: string;
  paymentId: string;
  date: string;
  name: string;
  amount: Money;
  currency: string;
  cashFlow: "income" | "expense";
  source: ForecastEventSource;
  status: ForecastEventStatus;
  /** Whether this event reduces Safe-to-Spend (expense only). */
  countsTowardSafeToSpend: boolean;
};

export type ForecastExcludedEvent = {
  id: string;
  paymentId: string;
  date: string;
  name: string;
  amount: Money;
  currency: string;
  cashFlow: "income" | "expense";
  source: ForecastEventSource;
  status: ForecastEventStatus;
  reason: string;
};

export type CurrencyForecast = {
  currency: string;
  currentBalance: Money;
  expectedIncome: Money;
  expectedExpense: Money;
  /** current + expectedIncome − expectedExpense */
  forecastBalance: Money;
  /** current − mandatoryOutflows − reserve (never inflated by income) */
  safeToSpend: Money;
  /** True when safeToSpend < 0 */
  isDeficit: boolean;
  deficitAmount: Money;
  reserve: Money;
  mandatoryOutflows: Money;
};

export type ForecastCashFlowPoint = {
  date: string;
  /** Running forecast balance after applying included events on this date. */
  forecastBalance: Money;
  expectedIncome: Money;
  expectedExpense: Money;
  kind: "forecast";
};

export type BuildForecastInput = {
  today: string;
  horizonEnd: string;
  /** Current balances by currency (active accounts only). */
  balancesByCurrency: Record<string, MoneyInput>;
  candidates: ForecastCandidateEvent[];
  /** Per-currency cash reserve from household settings. Missing currencies use 0. */
  reserveByCurrency?: Record<string, MoneyInput>;
};

export type BuildForecastResult = {
  byCurrency: CurrencyForecast[];
  included: ForecastIncludedEvent[];
  excluded: ForecastExcludedEvent[];
  /** Daily running forecast balance for the primary series (all currencies separate). */
  cashFlowByCurrency: Record<string, ForecastCashFlowPoint[]>;
  warnings: string[];
};

function normalizeCurrency(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Classify a candidate for inclusion in forecast / Safe-to-Spend.
 * Safe-to-Spend never includes income.
 */
export function classifyForecastCandidate(
  event: ForecastCandidateEvent,
  today: string,
  horizonEnd: string,
):
  | { include: true; countsTowardSafeToSpend: boolean }
  | { include: false; reason: string } {
  if (event.transactionId) {
    return {
      include: false,
      reason: "Already linked to a posted transaction (reflected in balance)",
    };
  }

  if (event.status === "paid") {
    return {
      include: false,
      reason: "Already paid — reflected in current balance",
    };
  }

  if (event.status === "skipped") {
    return { include: false, reason: "Skipped — not an upcoming obligation" };
  }

  // Past projected gaps without a materialised occurrence are ambiguous.
  if (event.source === "projected" && event.date < today) {
    return {
      include: false,
      reason: "Past projected date without an occurrence row — ambiguous",
    };
  }

  // Future events beyond horizon
  if (event.date > horizonEnd) {
    return { include: false, reason: "Outside selected forecast horizon" };
  }

  // Overdue / pending materialised: include even when date < today
  if (event.source === "occurrence") {
    if (event.status !== "pending" && event.status !== "overdue") {
      return {
        include: false,
        reason: `Occurrence status "${event.status}" is not forecastable`,
      };
    }
    // pending scheduled after horizon already handled; overdue before today OK
    if (event.date > horizonEnd) {
      return { include: false, reason: "Outside selected forecast horizon" };
    }
  }

  if (event.source === "projected") {
    if (event.status !== "scheduled") {
      return {
        include: false,
        reason: `Projected status "${event.status}" is not forecastable`,
      };
    }
    if (event.date < today) {
      return {
        include: false,
        reason: "Past projected date without an occurrence row — ambiguous",
      };
    }
  }

  const countsTowardSafeToSpend =
    event.cashFlow === "expense" && event.isMandatory !== false;
  return { include: true, countsTowardSafeToSpend };
}

function listDatesInclusive(start: string, end: string): string[] {
  if (end < start) return [];
  const dates: string[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 400) {
    dates.push(cursor);
    const [y, m, d] = cursor.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const yy = next.getUTCFullYear();
    const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(next.getUTCDate()).padStart(2, "0");
    cursor = `${yy}-${mm}-${dd}`;
    guard += 1;
  }
  return dates;
}

/**
 * Pure forecast + Safe-to-Spend builder.
 *
 * Formulas (per currency):
 * - forecastBalance = currentBalance + expectedIncome − expectedExpense
 * - safeToSpend = currentBalance − mandatoryOutflows − reserve
 *   (mandatoryOutflows = included expense events only; income never increases STS)
 * - Budgets are NOT subtracted here — surface them separately in UI.
 */
export function buildForecast(input: BuildForecastInput): BuildForecastResult {
  const reserveConfigured = Object.values(input.reserveByCurrency ?? {}).some(
    (value) => compareMoney(asMoney(value), zeroMoney()) > 0,
  );
  const warnings: string[] = [
    "Safe-to-Spend is an estimate from app data, not a guarantee of financial safety.",
    ...(reserveConfigured
      ? []
      : ["Cash reserve is not configured in settings — treated as 0.00."]),
    "Unconfirmed income sources are not projected; only scheduled recurring income may appear as expected income.",
    "Remaining budgets are informational and are not deducted from Safe-to-Spend (avoids double-counting with recurring).",
    "Recurring expenses marked as optional lower the forecast balance but not Safe-to-Spend.",
  ];

  const included: ForecastIncludedEvent[] = [];
  const excluded: ForecastExcludedEvent[] = [];

  for (const candidate of input.candidates) {
    const amount = asMoney(candidate.amount);
    const currency = normalizeCurrency(candidate.currency);
    const verdict = classifyForecastCandidate(
      candidate,
      input.today,
      input.horizonEnd,
    );

    if (!verdict.include) {
      excluded.push({
        id: candidate.id,
        paymentId: candidate.paymentId,
        date: candidate.date,
        name: candidate.name,
        amount,
        currency,
        cashFlow: candidate.cashFlow,
        source: candidate.source,
        status: candidate.status,
        reason: verdict.reason,
      });
      continue;
    }

    included.push({
      id: candidate.id,
      paymentId: candidate.paymentId,
      date: candidate.date,
      name: candidate.name,
      amount,
      currency,
      cashFlow: candidate.cashFlow,
      source: candidate.source,
      status: candidate.status,
      countsTowardSafeToSpend: verdict.countsTowardSafeToSpend,
    });
  }

  included.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.name.localeCompare(b.name);
  });

  const currencies = new Set<string>();
  for (const [code, bal] of Object.entries(input.balancesByCurrency)) {
    currencies.add(normalizeCurrency(code));
    void bal;
  }
  for (const event of included) {
    currencies.add(event.currency);
  }
  for (const code of Object.keys(input.reserveByCurrency ?? {})) {
    currencies.add(normalizeCurrency(code));
  }

  const byCurrency: CurrencyForecast[] = [];
  const cashFlowByCurrency: Record<string, ForecastCashFlowPoint[]> = {};

  const sortedCurrencies = [...currencies].sort((a, b) => a.localeCompare(b));

  for (const currency of sortedCurrencies) {
    const currentBalance = asMoney(
      input.balancesByCurrency[currency] ??
        input.balancesByCurrency[currency.toLowerCase()] ??
        zeroMoney(),
    );
    const reserve = asMoney(
      input.reserveByCurrency?.[currency] ??
        input.reserveByCurrency?.[currency.toLowerCase()] ??
        zeroMoney(),
    );

    const currencyEvents = included.filter((e) => e.currency === currency);
    let expectedIncome = zeroMoney();
    let expectedExpense = zeroMoney();
    let mandatoryOutflows = zeroMoney();

    for (const event of currencyEvents) {
      if (event.cashFlow === "income") {
        expectedIncome = addMoney(expectedIncome, event.amount);
      } else {
        expectedExpense = addMoney(expectedExpense, event.amount);
        if (event.countsTowardSafeToSpend) {
          mandatoryOutflows = addMoney(mandatoryOutflows, event.amount);
        }
      }
    }

    const forecastBalance = subtractMoney(
      addMoney(currentBalance, expectedIncome),
      expectedExpense,
    );
    const safeToSpend = subtractMoney(
      subtractMoney(currentBalance, mandatoryOutflows),
      reserve,
    );
    const isDeficit = compareMoney(safeToSpend, zeroMoney()) < 0;
    const deficitAmount = isDeficit
      ? asMoney(subtractMoney(zeroMoney(), safeToSpend))
      : zeroMoney();

    byCurrency.push({
      currency,
      currentBalance,
      expectedIncome,
      expectedExpense,
      forecastBalance,
      safeToSpend,
      isDeficit,
      deficitAmount,
      reserve,
      mandatoryOutflows,
    });

    // Daily running balance for charts (forecast segment only — no fabricated history).
    // Overdue occurrences are dated before today but still count in the
    // totals; book them on today so the chart's last point equals
    // forecastBalance.
    const byDate = new Map<string, { income: Money; expense: Money }>();
    for (const event of currencyEvents) {
      const day = event.date < input.today ? input.today : event.date;
      const bucket = byDate.get(day) ?? {
        income: zeroMoney(),
        expense: zeroMoney(),
      };
      if (event.cashFlow === "income") {
        bucket.income = addMoney(bucket.income, event.amount);
      } else {
        bucket.expense = addMoney(bucket.expense, event.amount);
      }
      byDate.set(day, bucket);
    }

    let running = currentBalance;
    const points: ForecastCashFlowPoint[] = [];
    for (const date of listDatesInclusive(input.today, input.horizonEnd)) {
      const bucket = byDate.get(date) ?? {
        income: zeroMoney(),
        expense: zeroMoney(),
      };
      running = subtractMoney(addMoney(running, bucket.income), bucket.expense);
      points.push({
        date,
        forecastBalance: running,
        expectedIncome: bucket.income,
        expectedExpense: bucket.expense,
        kind: "forecast",
      });
    }
    cashFlowByCurrency[currency] = points;
  }

  return {
    byCurrency,
    included,
    excluded,
    cashFlowByCurrency,
    warnings,
  };
}
